/**
 * Phone-side protocol client for Sovra Harness remote control.
 *
 * Follows the desktop contract in `SovraHarness/docs/remote-control.md` and the
 * reference client `crates/sovra-runtime/src/remote_reference.rs`:
 *
 * - Hello on every new connection; sequence restarts at 1 and is consumed even on error.
 * - Reads (inspect, screenshot) reconnect once automatically.
 * - Mutations never reconnect and are never replayed. A lost reply is `outcome_unknown`.
 * - Every mutation carries the revision of an inspection taken immediately before it,
 *   in the same session. `stale_observation` is refused before delivery, so retrying
 *   the inspect + mutation pair is safe; nothing else is retried.
 * - All calls are serialized: one request in flight per connection.
 */
import type { PairingTicket } from './ticket';
import { type DesktopConnection, type PhoneTransport, TransportFailure } from './transport';
import {
  type ErrorCode,
  type Hex32,
  type InspectResult,
  MAX_PHONE_NAME_BYTES,
  MAX_REQUEST_BYTES,
  MAX_SESSION_REQUESTS,
  type PeerAddress,
  PROTOCOL_VERSION,
  type RemoteOperation,
  type RemoteResponse,
  type UiElement,
  type UiRequest,
  decodeResponse,
  isMutation,
  parseInspect,
  parseScreenshot,
  utf8Length,
  validateUiRequest,
} from './wire';

/** Desktop error codes plus `unreachable`, which must never be read as "revoked". */
export type ClientErrorCode = ErrorCode | 'unreachable';

export type Outcome<T> = { ok: true; value: T } | { ok: false; code: ClientErrorCode; message: string };

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const fail = <T = never>(code: ClientErrorCode, message: string): Outcome<T> => ({ ok: false, code, message });

/** A mutation is retried only on `stale_observation`, which the desktop rejects before delivery. */
const MAX_STALE_RETRIES = 4;

interface Session {
  connection: DesktopConnection;
  generation: Hex32;
  nonce: Hex32;
  next: number;
}

/** Identifies a control across inspections. The target is opaque and session-scoped. */
export interface ElementRef {
  target: string;
  label: string | null;
  role: string | null;
}

export type Intent =
  | { kind: 'click'; element: ElementRef }
  | { kind: 'scroll'; element: ElementRef; lines: number }
  | { kind: 'type'; text: string }
  | { kind: 'key'; key: string };

export interface Delivered {
  /** Inspection the mutation was validated against (before the input landed). */
  before: InspectResult;
  next: string | null;
}

/** Find the same control in a fresh inspection, or null if it moved or vanished. */
export function resolveElement(element: ElementRef, snapshot: InspectResult): UiElement | null {
  const exact = snapshot.elements.find((candidate) => candidate.target === element.target);
  if (exact) return exact;
  // Targets are discarded on reconnect; fall back to a unique labelled match.
  if (!element.label) return null;
  const matches = snapshot.elements.filter(
    (candidate) => candidate.label === element.label && candidate.role === element.role && candidate.visible,
  );
  return matches.length === 1 ? matches[0] : null;
}

export function sanitizePhoneName(name: string): string {
  // Untrusted display text on the desktop: no control characters, at most 80 UTF-8 bytes.
  let clean = name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  while (utf8Length(clean) > MAX_PHONE_NAME_BYTES) clean = Array.from(clean).slice(0, -1).join('');
  return clean || 'My phone';
}

export class RemoteClient {
  private session: Session | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly transport: PhoneTransport,
    private desktop: PeerAddress | null,
  ) {}

  get paired(): boolean {
    return this.desktop !== null;
  }

  get connected(): boolean {
    return this.session !== null && !this.session.connection.isClosed();
  }

  /** Serialize every call so sequence numbers and revisions never interleave. */
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Pair with a scanned invitation. Tries Hello first so a lost Paired reply can be
   * recovered without a new QR. Returns the address to persist on success.
   */
  pair(ticket: PairingTicket, name: string): Promise<Outcome<PeerAddress>> {
    return this.exclusive(async () => {
      this.disconnect();
      const connection = await this.connect(ticket.address);
      if (!connection.ok) return connection;
      try {
        const hello = await this.exchange(connection.value, { op: 'hello' });
        let response: RemoteResponse | null;
        if (hello?.status === 'ready' && hello.version === PROTOCOL_VERSION) {
          // Already paired (this phone forgot the computer, or a `paired` reply was lost).
          // Still hand over the code so the desktop closes it instead of pausing control
          // until it expires. Hello already proved access, so any refusal is ignored.
          await this.exchange(connection.value, { op: 'pair', secret: ticket.secret, name: sanitizePhoneName(name) });
          response = { status: 'paired' };
        } else if (hello?.status === 'error' && hello.code === 'not_paired') {
          response = await this.exchange(connection.value, {
            op: 'pair',
            secret: ticket.secret,
            name: sanitizePhoneName(name),
          });
          if (response === null) {
            return fail(
              'outcome_unknown',
              'The pairing reply was lost. Scan again: Sovra checks first whether this phone is already paired.',
            );
          }
        } else if (hello?.status === 'error') {
          return fail(hello.code, hello.message);
        } else if (hello === null) {
          return fail('outcome_unknown', 'Your computer did not answer. Try again when it is reachable.');
        } else {
          return fail('unsupported_version', 'Your computer runs a different Sovra version. Update both apps.');
        }
        if (response.status === 'paired') {
          this.desktop = ticket.address;
          return ok(ticket.address);
        }
        if (response.status === 'error') return fail(response.code, response.message);
        return fail('unsupported_version', 'Your computer answered pairing unexpectedly.');
      } finally {
        connection.value.close();
      }
    });
  }

  inspect(): Promise<Outcome<InspectResult>> {
    return this.exclusive(() => this.inspectLocked());
  }

  screenshot(): Promise<Outcome<string>> {
    return this.exclusive(async () => {
      const response = await this.controlLocked({ action: 'screenshot' }, null);
      if (!response.ok) return response;
      const png = parseScreenshot(response.value);
      return png ? ok(png) : fail('invalid_request', 'Your computer sent an unreadable screenshot.');
    });
  }

  /**
   * Inspect, re-find the control, then send the input against that fresh revision.
   * Never replays input whose outcome is unknown.
   */
  act(intent: Intent): Promise<Outcome<Delivered>> {
    return this.exclusive(async () => {
      for (let attempt = 0; attempt < MAX_STALE_RETRIES; attempt++) {
        const snapshot = await this.inspectLocked();
        if (!snapshot.ok) return snapshot;
        const request = this.requestFor(intent, snapshot.value);
        if (!request.ok) return request;
        const response = await this.controlLocked(request.value, snapshot.value.revision);
        if (!response.ok && response.code === 'stale_observation') continue;
        if (!response.ok) return response;
        const value = response.value as { next?: unknown } | null;
        return ok({ before: snapshot.value, next: typeof value?.next === 'string' ? value.next : null });
      }
      return fail('stale_observation', 'Sovra kept changing on your computer. Wait a moment and try again.');
    });
  }

  private requestFor(intent: Intent, snapshot: InspectResult): Outcome<UiRequest> {
    switch (intent.kind) {
      case 'type':
        return ok({ action: 'type', text: intent.text });
      case 'key':
        return ok({ action: 'key', key: intent.key });
      case 'click':
      case 'scroll': {
        const element = resolveElement(intent.element, snapshot);
        if (!element) {
          return fail('stale_observation', 'That control is no longer on screen. Pick it again.');
        }
        if (!element.visible || element.disabled === true) {
          return fail('invalid_request', 'That control is hidden or unavailable right now.');
        }
        return ok(
          intent.kind === 'click'
            ? { action: 'click', target: element.target }
            : { action: 'scroll', target: element.target, lines: intent.lines },
        );
      }
    }
  }

  private async inspectLocked(): Promise<Outcome<InspectResult>> {
    const response = await this.controlLocked({ action: 'inspect' }, null);
    if (!response.ok) return response;
    const snapshot = parseInspect(response.value);
    return snapshot ? ok(snapshot) : fail('invalid_request', 'Your computer sent an unreadable view.');
  }

  private async controlLocked(request: UiRequest, revision: string | null): Promise<Outcome<unknown>> {
    const invalid = validateUiRequest(request);
    if (invalid) return fail('invalid_request', invalid);
    const read = !isMutation(request);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.session && (this.session.next > MAX_SESSION_REQUESTS || this.session.connection.isClosed())) {
        this.disconnect();
      }
      if (!this.session) {
        if (!read) return fail('stale_session', 'Reconnected. Look at the screen again before sending input.');
        const hello = await this.hello();
        if (!hello.ok) return hello;
      }
      const session = this.session!;
      const operation: RemoteOperation = {
        op: 'control',
        generation: session.generation,
        session: session.nonce,
        sequence: session.next,
        revision,
        request,
      };
      // Consumed before sending, exactly like the desktop's SessionGuard.
      session.next += 1;
      const response = await this.exchange(session.connection, operation);
      if (response === null) {
        this.disconnect();
        if (read && attempt === 0) continue;
        return read
          ? fail('unreachable', 'Lost the connection to your computer.')
          : fail('outcome_unknown', 'The connection dropped before your computer replied. Check the screen before trying again.');
      }
      if (response.status === 'result') return ok(response.value);
      if (response.status === 'error') {
        if (response.code === 'stale_session' || response.code === 'disabled' || response.code === 'not_paired') {
          this.disconnect();
          if (read && attempt === 0 && response.code === 'stale_session') continue;
        }
        return fail(response.code, response.message);
      }
      return fail('unsupported_version', 'Your computer answered unexpectedly. Update both apps.');
    }
    return fail('unreachable', 'Your computer is not reachable right now.');
  }

  private async hello(): Promise<Outcome<null>> {
    if (!this.desktop) return fail('not_paired', 'Pair this phone with your computer first.');
    const connection = await this.connect(this.desktop);
    if (!connection.ok) return connection;
    const response = await this.exchange(connection.value, { op: 'hello' });
    if (response?.status === 'ready' && response.version === PROTOCOL_VERSION) {
      this.session = { connection: connection.value, generation: response.generation, nonce: response.session, next: 1 };
      return ok(null);
    }
    connection.value.close();
    if (response === null) return fail('unreachable', 'Your computer did not answer.');
    if (response.status === 'error') return fail(response.code, response.message);
    return fail('unsupported_version', 'Your computer runs a different Sovra version. Update both apps.');
  }

  private async connect(address: PeerAddress): Promise<Outcome<DesktopConnection>> {
    if (this.closed) return fail('unreachable', 'Remote control is paused.');
    try {
      const connection = await this.transport.connect(address);
      if (connection.peer() !== address.device) {
        connection.close();
        return fail('invalid_request', "That computer's identity does not match the one you paired with.");
      }
      return ok(connection);
    } catch (error) {
      const message = error instanceof TransportFailure ? error.message : String(error);
      return fail('unreachable', message || 'Your computer is not reachable right now.');
    }
  }

  /** null means "no usable reply": transport failure, timeout or malformed message. */
  private async exchange(connection: DesktopConnection, operation: RemoteOperation): Promise<RemoteResponse | null> {
    const json = JSON.stringify({ version: PROTOCOL_VERSION, operation });
    if (utf8Length(json) > MAX_REQUEST_BYTES) return null;
    try {
      return decodeResponse(await connection.request(json));
    } catch {
      return null;
    }
  }

  disconnect(): void {
    this.session?.connection.close();
    this.session = null;
  }

  forget(): void {
    this.disconnect();
    this.desktop = null;
  }

  /** Stop all traffic (app suspended or leaving). A new client is needed afterwards. */
  async close(): Promise<void> {
    this.closed = true;
    this.disconnect();
    await this.transport.close();
  }
}
