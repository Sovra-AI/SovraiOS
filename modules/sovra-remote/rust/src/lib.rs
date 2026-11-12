//! Phone side of the Sovra Harness remote-control transport.
//!
//! Deliberately thin: one Iroh endpoint with the phone's persistent key, and one
//! JSON request/reply per bidirectional QUIC stream (EOF frames the message). Every
//! protocol decision (pairing, Hello, sequencing, revisions, recovery) lives in
//! TypeScript (`src/protocol`), where it is unit-tested against the desktop fixtures.
//!
//! Mirrors `SovraHarness/crates/sovra-mesh/src/remote.rs`.

use std::{str::FromStr, sync::Arc, time::Duration};

use iroh::{
    Endpoint, EndpointAddr, PublicKey, RelayUrl, SecretKey, TransportAddr,
    endpoint::{self, presets},
};
use serde::Deserialize;

uniffi::setup_scaffolding!();

/// ALPN of the desktop's dedicated phone endpoint (`sovra_core::remote_control::REMOTE_ALPN`).
pub const REMOTE_ALPN: &[u8] = b"sovra/remote-control/1";
pub const MAX_REQUEST_BYTES: usize = 32 * 1024;
pub const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
/// The desktop's own transport deadline is 5 s; the phone waits slightly longer so
/// the desktop's typed timeout reply wins when both fire.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
/// Relay fallback and hole punching can take a few seconds on cellular networks.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum TransportError {
    #[error("{message}")]
    InvalidAddress { message: String },
    #[error("{message}")]
    Unreachable { message: String },
    #[error("{message}")]
    Protocol { message: String },
    #[error("The request timed out.")]
    Timeout,
    #[error("The connection is closed.")]
    Closed,
}

fn unreachable(error: impl std::fmt::Display) -> TransportError {
    TransportError::Unreachable {
        message: error.to_string(),
    }
}

fn protocol(message: &str) -> TransportError {
    TransportError::Protocol {
        message: message.into(),
    }
}

/// `sovra_core::group::PeerAddress`: desktop public key (64 hex) plus routing hints.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PeerAddress {
    device: String,
    relay: Option<String>,
    addrs: Vec<String>,
}

fn parse_hex32(text: &str) -> Result<[u8; 32], TransportError> {
    let invalid = || TransportError::InvalidAddress {
        message: "Expected 64 hexadecimal characters.".into(),
    };
    if text.len() != 64 || !text.is_ascii() {
        return Err(invalid());
    }
    let mut bytes = [0u8; 32];
    for (index, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&text[index * 2..index * 2 + 2], 16).map_err(|_| invalid())?;
    }
    Ok(bytes)
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn target(address_json: &str) -> Result<EndpointAddr, TransportError> {
    let address: PeerAddress =
        serde_json::from_str(address_json).map_err(|error| TransportError::InvalidAddress {
            message: error.to_string(),
        })?;
    let key = PublicKey::from_bytes(&parse_hex32(&address.device)?).map_err(|error| {
        TransportError::InvalidAddress {
            message: error.to_string(),
        }
    })?;
    let mut addrs = Vec::new();
    if let Some(relay) = &address.relay
        && let Ok(url) = RelayUrl::from_str(relay)
    {
        addrs.push(TransportAddr::Relay(url));
    }
    addrs.extend(
        address
            .addrs
            .iter()
            .filter_map(|text| text.parse().ok())
            .map(TransportAddr::Ip),
    );
    Ok(EndpointAddr::from_parts(key, addrs))
}

/// A fresh phone identity from OS randomness, as 64 hex digits. Store it in the
/// platform secure store; it is the phone's long-term private key.
#[uniffi::export]
pub fn generate_phone_secret() -> String {
    to_hex(&SecretKey::generate().to_bytes())
}

/// The public device ID (64 hex) the desktop will see for this secret.
#[uniffi::export]
pub fn phone_device_id(secret_hex: String) -> Result<String, TransportError> {
    let secret = SecretKey::from_bytes(&parse_hex32(&secret_hex)?);
    Ok(to_hex(secret.public().as_bytes()))
}

/// The phone's Iroh endpoint. Bind once per foreground session; close on suspend.
#[derive(Debug, uniffi::Object)]
pub struct PhoneEndpoint {
    endpoint: Endpoint,
}

#[uniffi::export(async_runtime = "tokio")]
impl PhoneEndpoint {
    /// `local_only` disables relays and Internet address lookup (single-LAN testing).
    #[uniffi::constructor]
    pub async fn bind(secret_hex: String, local_only: bool) -> Result<Arc<Self>, TransportError> {
        let secret = SecretKey::from_bytes(&parse_hex32(&secret_hex)?);
        let builder = if local_only {
            Endpoint::builder(presets::Minimal)
        } else {
            Endpoint::builder(presets::N0)
        };
        let endpoint = builder
            .secret_key(secret)
            // A pure client: it never accepts incoming protocols.
            .alpns(Vec::new())
            .bind()
            .await
            .map_err(unreachable)?;
        Ok(Arc::new(Self { endpoint }))
    }

    pub fn device_id(&self) -> String {
        to_hex(self.endpoint.id().as_bytes())
    }

    /// Dial the desktop, pinning its public key from the pairing ticket. The TLS
    /// handshake authenticates both keys before any request is sent.
    pub async fn connect(
        &self,
        address_json: String,
    ) -> Result<Arc<DesktopConnection>, TransportError> {
        let target = target(&address_json)?;
        let expected = target.id;
        let connection = tokio::time::timeout(
            CONNECT_TIMEOUT,
            self.endpoint.connect(target, REMOTE_ALPN),
        )
        .await
        .map_err(|_| TransportError::Timeout)?
        .map_err(unreachable)?;
        if connection.alpn() != REMOTE_ALPN || connection.remote_id() != expected {
            connection.close(0u32.into(), b"unexpected peer");
            return Err(protocol("The computer answered with the wrong identity or protocol."));
        }
        Ok(Arc::new(DesktopConnection { connection }))
    }

    pub async fn close(&self) {
        self.endpoint.close().await;
    }
}

/// One authenticated connection to the desktop. The desktop closes it after five
/// idle seconds; reconnect and send Hello again.
#[derive(Debug, uniffi::Object)]
pub struct DesktopConnection {
    connection: endpoint::Connection,
}

impl Drop for DesktopConnection {
    fn drop(&mut self) {
        self.connection.close(0u32.into(), b"remote control ended");
    }
}

#[uniffi::export(async_runtime = "tokio")]
impl DesktopConnection {
    /// Desktop public key from the completed handshake.
    pub fn peer(&self) -> String {
        to_hex(self.connection.remote_id().as_bytes())
    }

    /// True once the connection has closed for any reason (idle timeout, stop, revoke).
    pub fn is_closed(&self) -> bool {
        self.connection.close_reason().is_some()
    }

    /// Send one JSON `RemoteRequest`, return the JSON `RemoteResponse`.
    pub async fn request(&self, request_json: String) -> Result<String, TransportError> {
        if request_json.len() > MAX_REQUEST_BYTES {
            return Err(protocol("Remote message exceeds its size limit."));
        }
        tokio::time::timeout(REQUEST_TIMEOUT, async {
            let (mut send, mut recv) = self.connection.open_bi().await.map_err(|error| {
                if self.connection.close_reason().is_some() {
                    TransportError::Closed
                } else {
                    unreachable(error)
                }
            })?;
            send.write_all(request_json.as_bytes())
                .await
                .map_err(unreachable)?;
            send.finish().map_err(unreachable)?;
            let bytes = recv
                .read_to_end(MAX_RESPONSE_BYTES)
                .await
                .map_err(|_| protocol("Remote reply is incomplete or too large."))?;
            String::from_utf8(bytes).map_err(|_| protocol("Remote reply is not UTF-8."))
        })
        .await
        .map_err(|_| TransportError::Timeout)?
    }

    pub fn close(&self) {
        self.connection.close(0u32.into(), b"remote control ended");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_roundtrip_and_identity() {
        let secret = generate_phone_secret();
        assert_eq!(secret.len(), 64);
        let id = phone_device_id(secret.clone()).unwrap();
        assert_eq!(id.len(), 64);
        assert_ne!(id, secret);
        assert!(phone_device_id("zz".repeat(32)).is_err());
        assert!(phone_device_id("ab".into()).is_err());
    }

    #[test]
    fn address_parsing_is_strict() {
        let device = phone_device_id(generate_phone_secret()).unwrap();
        let ok = format!(
            r#"{{"device":"{device}","relay":"https://relay.example/","addrs":["127.0.0.1:1234","bad"]}}"#
        );
        let parsed = target(&ok).unwrap();
        assert_eq!(to_hex(parsed.id.as_bytes()), device);
        assert!(target(r#"{"device":"00","relay":null,"addrs":[]}"#).is_err());
        let spoof = format!(r#"{{"device":"{device}","relay":null,"addrs":[],"extra":1}}"#);
        assert!(target(&spoof).is_err());
    }
}
