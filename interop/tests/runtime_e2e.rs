//! Phone transport (SovraReactNative Rust crate) + exact client JSON against the
//! real Sovra desktop runtime: pairing allowlist, Hello sessions, sequence guard.
use sovra_core::{AgentConfig, Command, Event, remote_control::{RemoteCommand, RemoteEvent, RemoteState}};
use sovra_remote_ffi::{PhoneEndpoint, generate_phone_secret};
use sovra_runtime::{Client, RemoteConfig, RuntimeServices};
use std::{sync::Arc, time::Duration};

async fn event(client: &Client) -> RemoteEvent {
    tokio::time::timeout(Duration::from_secs(15), async {
        loop { if let Event::RemoteControl(e) = client.events().recv().await.unwrap() { return *e; } }
    }).await.expect("bounded event")
}
async fn state(client: &Client) -> RemoteState {
    loop { if let RemoteEvent::State(s) = event(client).await { return s; } }
}
/// Plays the native window: answers inspect with a revision, acknowledges input.
async fn ui(client: &Client) -> String {
    loop {
        if let RemoteEvent::UiRequest { generation, request_id, request, .. } = event(client).await {
            client.send(Command::RemoteControl(RemoteCommand::UiReply { generation, request_id,
                result: Ok(serde_json::json!({"elements": [], "total": 0, "truncated": false, "appearance": "dark", "interface_scale_percent": 100, "revision": "rev-1", "input_delivered": true})) })).unwrap();
            return format!("{request:?}");
        }
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn phone_pairs_and_controls_real_desktop_runtime() {
    let mut suffix = [0u8; 8]; getrandom::fill(&mut suffix).unwrap();
    let dir = std::env::temp_dir().join(format!("sovra-rn-e2e-{suffix:x?}"));
    let desktop = sovra_runtime::start_with_services("rn-e2e", AgentConfig::default(), RuntimeServices {
        remote_control: Some(RemoteConfig {
            directory: dir.join("desktop"),
            transport: Arc::new(|| Box::pin(async {
                sovra_mesh::RemoteMesh::bind([81; 32], sovra_mesh::Reach::LocalOnly).await
                    .map(|e| Arc::new(e) as Arc<dyn sovra_core::remote_control::RemoteEndpoint>)
                    .map_err(|e| e.to_string())
            })),
            qr: Arc::new(sovra_whatsapp::qr_matrix),
        }),
        ..RuntimeServices::default()
    }).unwrap();
    assert!(state(&desktop).await.generation.is_none());
    desktop.send(Command::RemoteControl(RemoteCommand::Start)).unwrap();
    let ticket = state(&desktop).await.invitation.unwrap();
    let address = serde_json::to_string(&ticket.address).unwrap();
    let secret_hex = serde_json::to_value(&ticket.secret).unwrap();
    let link = ticket.encode().unwrap();
    println!("LINK_LEN={}", link.len());

    let phone = PhoneEndpoint::bind(generate_phone_secret(), true).await.unwrap();
    let conn = phone.connect(address.clone()).await.unwrap();
    let r = conn.request(r#"{"version":1,"operation":{"op":"hello"}}"#.into()).await.unwrap();
    assert!(r.contains("not_paired"), "{r}");
    let pair = format!(r#"{{"version":1,"operation":{{"op":"pair","secret":{secret_hex},"name":"RN e2e phone"}}}}"#);
    let r = conn.request(pair.clone()).await.unwrap();
    assert_eq!(r, r#"{"status":"paired"}"#);
    // Second claimant with the consumed invitation is refused.
    let other = PhoneEndpoint::bind(generate_phone_secret(), true).await.unwrap();
    let oc = other.connect(address.clone()).await.unwrap();
    let r2 = oc.request(pair).await.unwrap();
    assert!(r2.contains("\"error\""), "{r2}");

    let ready: serde_json::Value = serde_json::from_str(&conn.request(r#"{"version":1,"operation":{"op":"hello"}}"#.into()).await.unwrap()).unwrap();
    assert_eq!(ready["status"], "ready");
    let (g, s) = (ready["generation"].as_str().unwrap().to_owned(), ready["session"].as_str().unwrap().to_owned());
    let control = |seq: u32, rev: &str, req: &str| format!(r#"{{"version":1,"operation":{{"op":"control","generation":"{g}","session":"{s}","sequence":{seq},"revision":{rev},"request":{req}}}}}"#);

    let (r, seen) = tokio::join!(conn.request(control(1, "null", r#"{"action":"inspect"}"#)), ui(&desktop));
    let r = r.unwrap(); assert!(r.contains("rev-1"), "{r}"); assert!(seen.contains("Inspect"));
    let (r, seen) = tokio::join!(conn.request(control(2, r#""rev-1""#, r#"{"action":"type","text":"hello from the phone"}"#)), ui(&desktop));
    assert!(r.unwrap().contains("input_delivered")); assert!(seen.contains("hello from the phone"), "{seen}");
    // Mutation without a revision: stale_observation; replayed sequence: stale_session.
    let r = conn.request(control(3, "null", r#"{"action":"key","key":"enter"}"#)).await.unwrap();
    assert!(r.contains("stale_observation"), "{r}");
    let r = conn.request(control(3, r#""rev-1""#, r#"{"action":"key","key":"enter"}"#)).await.unwrap();
    assert!(r.contains("stale_session"), "{r}");

    // Idle close after 5 s, then reconnect with Hello and no new invitation.
    tokio::time::sleep(Duration::from_secs(6)).await;
    assert!(conn.is_closed(), "desktop closes idle connections");
    let conn = phone.connect(address.clone()).await.unwrap();
    let r = conn.request(r#"{"version":1,"operation":{"op":"hello"}}"#.into()).await.unwrap();
    assert!(r.contains("\"ready\""), "{r}");

    // Stop: the phone sees `disabled`, never silently re-enabled.
    desktop.send(Command::RemoteControl(RemoteCommand::Stop)).unwrap();
    tokio::time::sleep(Duration::from_millis(500)).await;
    let r = match phone.connect(address).await { Ok(c) => c.request(r#"{"version":1,"operation":{"op":"hello"}}"#.into()).await.map_err(|e| e.to_string()), Err(e) => Err(e.to_string()) };
    println!("AFTER_STOP={r:?}");
    assert!(!matches!(&r, Ok(t) if t.contains("ready")));
    phone.close().await; other.close().await;
    tokio::task::spawn_blocking(move || desktop.shutdown_blocking()).await.unwrap().unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
