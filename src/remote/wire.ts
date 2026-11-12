/**
 * Version 1 phone wire contract, mirrored from the desktop:
 * `SovraHarness/crates/sovra-core/src/remote_control/wire.rs` and
 * `crates/sovra-core/src/development.rs` (`UiRequest`).
 *
 * The checked fixtures in `__tests__/fixtures` are copied byte-for-byte from the
 * harness; `wire.test.ts` fails if these types drift from them.
 */

export const PROTOCOL_VERSION = 1;
export const MAX_REQUEST_BYTES = 32 * 1024;
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
/** `sovra_core::remote_control::MAX_SESSION_REQUESTS`: renew with Hello after this. */
export const MAX_SESSION_REQUESTS = 4096;
export const MAX_TEXT_BYTES = 4096;
export const MAX_TARGET_BYTES = 2048;
export const MAX_SCROLL_LINES = 100;
export const MAX_PHONE_NAME_BYTES = 80;

/** 64 lowercase hex digits (a 32-byte key, secret or nonce). */
export type Hex32 = string;

/** `sovra_core::group::PeerAddress`: public routing information, not a credential. */
export interface PeerAddress {
  device: Hex32;
  relay: string | null;
  addrs: string[];
}

export type UiRequest =
  | { action: 'inspect' }
  | { action: 'screenshot' }
  | { action: 'click'; target: string }
  | { action: 'type'; text: string }
  | { action: 'key'; key: string }
  | { action: 'scroll'; target: string; lines: number };

export type RemoteOperation =
  | { op: 'pair'; secret: Hex32; name: string }
  | { op: 'hello' }
  | {
      op: 'control';
      generation: Hex32;
      session: Hex32;
      sequence: number;
      revision: string | null;
      request: UiRequest;
    };

export interface RemoteRequest {
  version: number;
  operation: RemoteOperation;
}

export const ERROR_CODES = [
  'disabled',
  'unsupported_version',
  'not_paired',
  'invalid_invitation',
  'invalid_request',
  'stale_session',
  'stale_observation',
  'busy',
  'storage_unavailable',
  'outcome_unknown',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type RemoteResponse =
  | { status: 'paired' }
  | {
      status: 'ready';
      version: number;
      generation: Hex32;
      session: Hex32;
      max_request_bytes: number;
      max_response_bytes: number;
    }
  | { status: 'result'; value: unknown }
  | { status: 'error'; code: ErrorCode; message: string };

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One native control from Inspect. Never parse or construct `target`. */
export interface UiElement {
  target: string;
  label: string | null;
  role: string | null;
  visible: boolean;
  disabled: boolean | null;
  checked: unknown;
  selected: boolean | null;
  expanded: boolean | null;
  bounds: Bounds;
}

export interface InspectResult {
  elements: UiElement[];
  total: number;
  truncated: boolean;
  appearance: 'dark' | 'light';
  interface_scale_percent: number;
  revision: string;
}

const HEX32 = /^[0-9a-f]{64}$/;

export function isHex32(value: unknown): value is Hex32 {
  return typeof value === 'string' && HEX32.test(value);
}

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Same rules as `UiRequest::validate` on the desktop, so bad input never costs a sequence. */
export function validateUiRequest(request: UiRequest): string | null {
  switch (request.action) {
    case 'inspect':
    case 'screenshot':
      return null;
    case 'click':
    case 'scroll': {
      const length = utf8Length(request.target);
      if (length === 0 || length > MAX_TARGET_BYTES) {
        return 'Pick a control from the latest view first.';
      }
      if (
        request.action === 'scroll' &&
        (!Number.isInteger(request.lines) || Math.abs(request.lines) > MAX_SCROLL_LINES)
      ) {
        return 'Scroll between -100 and 100 lines.';
      }
      return null;
    }
    case 'type':
      if (utf8Length(request.text) > MAX_TEXT_BYTES || request.text.includes('\0')) {
        return 'That text is too long to send in one go (4096 bytes).';
      }
      return null;
    case 'key':
      if (request.key.length === 0 || utf8Length(request.key) > 80) {
        return 'That key is not supported.';
      }
      return null;
  }
}

export function isMutation(request: UiRequest): boolean {
  return request.action !== 'inspect' && request.action !== 'screenshot';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strict decode of a desktop reply. Anything unexpected is a protocol error, not data. */
export function decodeResponse(text: string): RemoteResponse | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(value)) return null;
  switch (value.status) {
    case 'paired':
      return { status: 'paired' };
    case 'ready':
      if (
        typeof value.version === 'number' &&
        isHex32(value.generation) &&
        isHex32(value.session) &&
        typeof value.max_request_bytes === 'number' &&
        typeof value.max_response_bytes === 'number'
      ) {
        return {
          status: 'ready',
          version: value.version,
          generation: value.generation,
          session: value.session,
          max_request_bytes: value.max_request_bytes,
          max_response_bytes: value.max_response_bytes,
        };
      }
      return null;
    case 'result':
      return 'value' in value ? { status: 'result', value: value.value } : null;
    case 'error':
      if (
        typeof value.message === 'string' &&
        (ERROR_CODES as readonly unknown[]).includes(value.code)
      ) {
        return { status: 'error', code: value.code as ErrorCode, message: value.message };
      }
      return null;
    default:
      return null;
  }
}

function isBounds(value: unknown): value is Bounds {
  return (
    isObject(value) &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  );
}

const optionalBool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);
const optionalString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** Parse an Inspect `result.value`; drops malformed elements rather than trusting them. */
export function parseInspect(value: unknown): InspectResult | null {
  if (!isObject(value) || !Array.isArray(value.elements) || typeof value.revision !== 'string') {
    return null;
  }
  const elements: UiElement[] = [];
  for (const raw of value.elements) {
    if (!isObject(raw) || typeof raw.target !== 'string' || !isBounds(raw.bounds)) continue;
    elements.push({
      target: raw.target,
      label: optionalString(raw.label),
      role: optionalString(raw.role),
      visible: raw.visible === true,
      disabled: optionalBool(raw.disabled),
      checked: raw.checked ?? null,
      selected: optionalBool(raw.selected),
      expanded: optionalBool(raw.expanded),
      bounds: raw.bounds,
    });
  }
  return {
    elements,
    total: typeof value.total === 'number' ? value.total : elements.length,
    truncated: value.truncated === true,
    appearance: value.appearance === 'light' ? 'light' : 'dark',
    interface_scale_percent:
      typeof value.interface_scale_percent === 'number' ? value.interface_scale_percent : 100,
    revision: value.revision,
  };
}

export function parseScreenshot(value: unknown): string | null {
  return isObject(value) && typeof value.png === 'string' ? value.png : null;
}
