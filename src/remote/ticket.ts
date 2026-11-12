/**
 * Strict parser for the desktop pairing QR, mirroring `PairingTicket::decode` in
 * `SovraHarness/crates/sovra-core/src/remote_control/wire.rs`.
 *
 * The link is a bearer invitation: never log it, persist it, or put it in analytics.
 * Only `address` (public routing hints) may be saved after pairing succeeds.
 */
import { type Hex32, type PeerAddress, PROTOCOL_VERSION, isHex32 } from './wire';

const MAX_TICKET_BYTES = 2048;
const PREFIX = 'sovra://remote-control?';

export interface PairingTicket {
  version: number;
  address: PeerAddress;
  secret: Hex32;
}

/** `application/x-www-form-urlencoded` decoding, as Rust's `url::Url::query_pairs`. */
function formDecode(text: string): string | null {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
}

function isPort(text: string): boolean {
  if (!/^\d{1,5}$/.test(text)) return false;
  const port = Number(text);
  return port >= 0 && port <= 65535;
}

/** Accepts what Rust's `SocketAddr::from_str` accepts in practice: `a.b.c.d:p` or `[v6]:p`. */
export function isSocketAddress(text: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d+)$/.exec(text);
  if (v4) {
    return v4.slice(1, 5).every((part) => Number(part) <= 255 && String(Number(part)) === part) && isPort(v4[5]);
  }
  const v6 = /^\[([0-9a-fA-F:.]+)(%[0-9]+)?\]:(\d+)$/.exec(text);
  return v6 !== null && v6[1].includes(':') && isPort(v6[3]);
}

function isRelay(text: string): boolean {
  if (text.length > 2048) return false;
  // https://host[:port]/path — no credentials, query or fragment.
  return /^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?(\/[^?#@\s]*)?$/.test(text);
}

export function validateAddress(address: unknown): address is PeerAddress {
  if (typeof address !== 'object' || address === null || Array.isArray(address)) return false;
  const value = address as Record<string, unknown>;
  if (!hasOnlyKeys(value, ['device', 'relay', 'addrs'])) return false;
  if (!isHex32(value.device)) return false;
  if (value.relay !== null && (typeof value.relay !== 'string' || !isRelay(value.relay))) return false;
  if (!Array.isArray(value.addrs) || value.addrs.length > 16) return false;
  return value.addrs.every((entry) => typeof entry === 'string' && isSocketAddress(entry));
}

/** Returns null for anything that is not exactly a version 1 Sovra invitation. */
export function decodeTicket(link: string): PairingTicket | null {
  const trimmed = link.trim();
  if (new TextEncoder().encode(trimmed).length > MAX_TICKET_BYTES) return null;
  if (!trimmed.startsWith(PREFIX) || trimmed.includes('#')) return null;
  const query = trimmed.slice(PREFIX.length);
  const pairs = query.split('&');
  if (pairs.length !== 1) return null;
  const separator = pairs[0].indexOf('=');
  if (separator < 0 || formDecode(pairs[0].slice(0, separator)) !== 'ticket') return null;
  const payload = formDecode(pairs[0].slice(separator + 1));
  if (payload === null) return null;
  let ticket: unknown;
  try {
    ticket = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof ticket !== 'object' || ticket === null || Array.isArray(ticket)) return null;
  const value = ticket as Record<string, unknown>;
  if (!hasOnlyKeys(value, ['version', 'address', 'secret'])) return null;
  if (value.version !== PROTOCOL_VERSION || !isHex32(value.secret)) return null;
  if (!validateAddress(value.address)) return null;
  return { version: PROTOCOL_VERSION, address: value.address, secret: value.secret };
}
