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

/** One authenticated QUIC connection to the desktop (one JSON message per stream). */
export interface DesktopConnection {
  /** Desktop public key from the completed TLS handshake. */
  peer(): string;
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
