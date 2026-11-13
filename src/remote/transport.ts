import type { PeerAddress } from './wire';

/** Why the transport could not deliver a message. Mirrors the Rust `TransportError`. */
export type TransportFailureKind = 'invalid_address' | 'unreachable' | 'protocol' | 'timeout' | 'closed';

export class TransportFailure extends Error {
  constructor(
    readonly kind: TransportFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'TransportFailure';
  }
}

/** How traffic reaches the desktop: on the same network (or a punched hole), or through an encrypted Iroh relay. */
export type Route = 'direct' | 'relay' | 'unknown';

/** One authenticated QUIC connection to the desktop (one JSON message per stream). */
export interface DesktopConnection {
  /** Desktop public key from the completed TLS handshake. */
  peer(): string;
  /** The path in use right now; it can change while connected (relay first, then direct). */
  route?(): Route;
  isClosed(): boolean;
  request(json: string): Promise<string>;
  close(): void;
}

/** The phone's endpoint, bound with its persistent identity key. */
export interface PhoneTransport {
  deviceId(): string;
  connect(address: PeerAddress): Promise<DesktopConnection>;
  close(): Promise<void>;
}
