/**
 * In-memory desktop that enforces the same rules as the Rust runtime:
 * pairing allowlist, Hello sessions, exact sequences consumed even on error,
 * revisions required for mutations, and an idle-closed connection.
 */
import { type DesktopConnection, type PhoneTransport, TransportFailure } from '../transport';
import type { InspectResult, PeerAddress, RemoteRequest, UiElement } from '../wire';

export const DESKTOP = '01'.repeat(32);
export const SECRET = '02'.repeat(32);
export const PHONE = 'ab'.repeat(32);

export const desktopAddress: PeerAddress = { device: DESKTOP, relay: null, addrs: ['127.0.0.1:1'] };

let nonceCounter = 0;
const nonce = () => (++nonceCounter).toString(16).padStart(64, '0');

export interface Delivered {
  action: string;
  target?: string;
  text?: string;
  key?: string;
}

export class FakeDesktop {
  enabled = true;
  paired = new Set<string>();
  invitation: string | null = SECRET;
  generation = nonce();
  elements: UiElement[] = [];
  revision = 1;
  delivered: Delivered[] = [];
  requests: RemoteRequest[] = [];
  /** Change the window between inspect and the next mutation this many times. */
  churn = 0;
  /** Drop the reply (after executing) to the next N requests. */
  dropReplies = 0;
  /** Execute the next request with this action, then lose its reply. */
  dropReplyFor: string | null = null;
  unreachable = false;
  connections: FakeConnection[] = [];
  /** Lets a test change the window in response to delivered input (e.g. navigation). */
  onDeliver: ((input: Delivered) => void) | null = null;

  element(target: string, label: string | null, role: string | null, y = 0): UiElement {
    const element: UiElement = {
      target,
      label,
      role,
      visible: true,
      disabled: false,
      checked: null,
      selected: null,
      expanded: null,
      bounds: { x: 0, y, width: 100, height: 20 },
    };
    this.elements.push(element);
    return element;
  }

  /** What Inspect would return right now. */
  snapshot(): InspectResult {
    return {
      elements: this.elements,
      total: this.elements.length,
      truncated: false,
      appearance: 'dark',
      interface_scale_percent: 100,
      revision: `r${this.revision}`,
    };
  }

  transport(): PhoneTransport {
    return {
      deviceId: () => PHONE,
      connect: async (address) => {
        if (this.unreachable || address.device !== DESKTOP) throw new TransportFailure('unreachable', 'offline');
        const connection = new FakeConnection(this);
        this.connections.push(connection);
        return connection;
      },
      close: async () => undefined,
    };
  }
}

class FakeConnection implements DesktopConnection {
  closed = false;
  session: { generation: string; nonce: string; next: number } | null = null;

  constructor(private readonly desktop: FakeDesktop) {}

  peer() {
    return DESKTOP;
  }

  isClosed() {
    return this.closed;
  }

  close() {
    this.closed = true;
  }

  async request(json: string): Promise<string> {
    if (this.closed) throw new TransportFailure('closed', 'closed');
    const request = JSON.parse(json) as RemoteRequest;
    this.desktop.requests.push(request);
    const reply = this.handle(request);
    const action = request.operation.op === 'control' ? request.operation.request.action : null;
    if (this.desktop.dropReplyFor !== null && action === this.desktop.dropReplyFor) {
      this.desktop.dropReplyFor = null;
      this.closed = true;
      throw new TransportFailure('timeout', 'lost');
    }
    if (this.desktop.dropReplies > 0) {
      this.desktop.dropReplies -= 1;
      this.closed = true;
      throw new TransportFailure('timeout', 'lost');
    }
    return JSON.stringify(reply);
  }

  private error(code: string, message = code) {
    return { status: 'error', code, message };
  }

  private handle(request: RemoteRequest): unknown {
    const desktop = this.desktop;
    if (request.version !== 1) return this.error('unsupported_version');
    if (!desktop.enabled) return this.error('disabled');
    const op = request.operation;
    if (op.op === 'pair') {
      if (op.secret !== desktop.invitation) return this.error('invalid_invitation');
      desktop.invitation = null;
      desktop.paired.add(PHONE);
      return { status: 'paired' };
    }
    if (!desktop.paired.has(PHONE)) return this.error('not_paired');
    if (op.op === 'hello') {
      this.session = { generation: desktop.generation, nonce: nonce(), next: 1 };
      return {
        status: 'ready',
        version: 1,
        generation: this.session.generation,
        session: this.session.nonce,
        max_request_bytes: 32768,
        max_response_bytes: 8388608,
      };
    }
    const session = this.session;
    if (!session || op.generation !== session.generation || op.session !== session.nonce || op.sequence !== session.next) {
      return this.error('stale_session');
    }
    session.next += 1;
    const current = `r${desktop.revision}`;
    switch (op.request.action) {
      case 'inspect':
        return {
          status: 'result',
          value: {
            elements: desktop.elements,
            total: desktop.elements.length,
            truncated: false,
            input_values: 'omitted for privacy',
            appearance: 'dark',
            interface_scale_percent: 100,
            revision: current,
          },
        };
      case 'screenshot':
        return { status: 'result', value: { png: 'iVBORw0KGgo=' } };
      default: {
        if (desktop.churn > 0) {
          desktop.churn -= 1;
          desktop.revision += 1;
        }
        if (op.revision !== `r${desktop.revision}`) return this.error('stale_observation');
        const action = op.request;
        if ((action.action === 'click' || action.action === 'scroll') && !desktop.elements.some((e) => e.target === action.target)) {
          return this.error('outcome_unknown', 'Target not found');
        }
        desktop.delivered.push({ ...action } as Delivered);
        desktop.onDeliver?.({ ...action } as Delivered);
        desktop.revision += 1;
        return { status: 'result', value: { input_delivered: true, next: 'Inspect to verify the result.' } };
      }
    }
  }
}
