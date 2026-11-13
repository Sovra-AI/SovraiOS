/**
 * Adapter from the Rust turbo module (`modules/sovra-remote`, Iroh over QUIC) to
 * the app's `PhoneTransport`. Creates the phone's persistent identity on first use.
 */
import { type DesktopConnectionLike, PhoneEndpoint, TransportError_Tags, generatePhoneSecret } from 'sovra-remote';

import { loadPhoneSecret, savePhoneSecret } from '@/state/storage';

import { type DesktopConnection, type PhoneTransport, type Route, TransportFailure, type TransportFailureKind } from './transport';

const KINDS: Record<TransportError_Tags, TransportFailureKind> = {
  [TransportError_Tags.InvalidAddress]: 'invalid_address',
  [TransportError_Tags.Unreachable]: 'unreachable',
  [TransportError_Tags.Protocol]: 'protocol',
  [TransportError_Tags.Timeout]: 'timeout',
  [TransportError_Tags.Closed]: 'closed',
};

/** Plain words for failures that carry no message of their own (the Android app says the same). */
const PLAIN: Partial<Record<TransportFailureKind, string>> = {
  timeout: 'Your computer took too long to answer.',
  closed: 'The connection closed.',
};

function translate(error: unknown): TransportFailure {
  const tag = (error as { tag?: TransportError_Tags } | null)?.tag;
  const kind = (tag && KINDS[tag]) || 'unreachable';
  const inner = (error as { inner?: { message?: unknown } } | null)?.inner?.message;
  // uniffi's own text ("TransportError.Timeout") is not for people.
  const message = typeof inner === 'string' && inner ? inner : (PLAIN[kind] ?? 'Your computer is not reachable right now.');
  return new TransportFailure(kind, message);
}

/** The phone's long-term key, created once from OS randomness and kept in secure storage. */
export async function phoneSecret(): Promise<string> {
  const existing = await loadPhoneSecret();
  if (existing) return existing;
  const created = generatePhoneSecret();
  await savePhoneSecret(created);
  // Re-read so a failed save never leaves us using a key we cannot recover.
  const saved = await loadPhoneSecret();
  if (saved !== created) throw new Error('Could not save this phone’s identity in secure storage.');
  return created;
}

class NativeConnection implements DesktopConnection {
  constructor(private readonly inner: DesktopConnectionLike) {}
  peer() {
    return this.inner.peer();
  }
  route(): Route {
    const route = this.inner.route();
    return route === 'direct' || route === 'relay' ? route : 'unknown';
  }
  isClosed() {
    return this.inner.isClosed();
  }
  async request(json: string) {
    try {
      return await this.inner.request(json);
    } catch (error) {
      throw translate(error);
    }
  }
  close() {
    this.inner.close();
  }
}

export async function createNativeTransport(localOnly: boolean): Promise<PhoneTransport> {
  const secret = await phoneSecret();
  let endpoint;
  try {
    endpoint = await PhoneEndpoint.bind(secret, localOnly);
  } catch (error) {
    throw translate(error);
  }
  return {
    deviceId: () => endpoint.deviceId(),
    async connect(address) {
      try {
        return new NativeConnection(await endpoint.connect(JSON.stringify(address)));
      } catch (error) {
        throw translate(error);
      }
    },
    close: () => endpoint.close(),
  };
}
