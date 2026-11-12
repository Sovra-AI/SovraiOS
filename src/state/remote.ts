/**
 * App-wide remote-control state. Owns one RemoteClient for the paired computer,
 * refreshes the mirror only while the remote screen is in the foreground (the
 * desktop closes idle connections after 5 s, and the contract forbids polling
 * while suspended), and maps each desktop error to its own recovery path.
 */
import { create } from 'zustand';

import { Backoff } from '@/remote/backoff';
import { sendChatMessage, stopWork } from '@/remote/chat';
import { type ClientErrorCode, type Intent, type Outcome, RemoteClient } from '@/remote/client';
import { decodeTicket } from '@/remote/ticket';
import type { PhoneTransport } from '@/remote/transport';
import type { InspectResult } from '@/remote/wire';

import { usePreferences } from './preferences';
import { type SavedDesktop, deleteDesktop, loadDesktop, saveDesktop } from './storage';

export type Phase =
  | 'loading'
  | 'unpaired'
  | 'connecting'
  | 'connected'
  | 'unreachable'
  | 'disabled'
  | 'busy'
  | 'revoked'
  | 'incompatible';

export interface Notice {
  tone: 'info' | 'success' | 'warning' | 'danger';
  text: string;
}

export type TransportFactory = (localOnly: boolean) => Promise<PhoneTransport>;

interface RemoteState {
  phase: Phase;
  desktop: SavedDesktop | null;
  snapshot: InspectResult | null;
  screenshot: string | null;
  updatedAt: number | null;
  /** Last desktop message for the current phase, shown verbatim (never parsed). */
  detail: string | null;
  notice: Notice | null;
  working: boolean;

  init(factory: TransportFactory): Promise<void>;
  pair(link: string, phoneName: string, desktopName: string): Promise<Outcome<null>>;
  refresh(): Promise<void>;
  startLive(): void;
  stopLive(): void;
  act(intent: Intent): Promise<boolean>;
  send(text: string, submit?: boolean): Promise<boolean>;
  stop(): Promise<boolean>;
  forget(): Promise<void>;
  dismissNotice(): void;
}

let factory: TransportFactory | null = null;
let transport: PhoneTransport | null = null;
let client: RemoteClient | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let live = false;
const backoff = new Backoff();

function phaseFor(code: ClientErrorCode): Phase {
  switch (code) {
    case 'unreachable':
      return 'unreachable';
    case 'disabled':
      return 'disabled';
    case 'busy':
      return 'busy';
    case 'not_paired':
      return 'revoked';
    case 'unsupported_version':
      return 'incompatible';
    default:
      return 'connected';
  }
}

async function ensureClient(): Promise<RemoteClient | null> {
  if (client) return client;
  if (!factory) return null;
  const { localOnly } = usePreferences.getState();
  transport = await factory(localOnly);
  client = new RemoteClient(transport, useRemote.getState().desktop?.address ?? null);
  return client;
}

async function resetClient(): Promise<void> {
  const old = client;
  client = null;
  transport = null;
  await old?.close().catch(() => undefined);
}

function schedule(delay: number) {
  if (timer) clearTimeout(timer);
  timer = live ? setTimeout(() => void useRemote.getState().refresh(), delay) : null;
}

export const useRemote = create<RemoteState>((set, get) => ({
  phase: 'loading',
  desktop: null,
  snapshot: null,
  screenshot: null,
  updatedAt: null,
  detail: null,
  notice: null,
  working: false,

  async init(next) {
    factory = next;
    const desktop = await loadDesktop();
    set({ desktop, phase: desktop ? 'connecting' : 'unpaired' });
  },

  async pair(link, phoneName, desktopName) {
    // The link is a bearer credential: it is decoded here and never stored or logged.
    const ticket = decodeTicket(link);
    if (!ticket) {
      return { ok: false, code: 'invalid_invitation', message: 'That is not a Sovra pairing code. Scan the code shown on your computer.' };
    }
    let remote: RemoteClient | null;
    try {
      remote = await ensureClient();
    } catch (error) {
      return { ok: false, code: 'unreachable', message: `Could not start a secure connection: ${String(error)}` };
    }
    if (!remote) return { ok: false, code: 'unreachable', message: 'Remote control is not available in this build.' };
    const result = await remote.pair(ticket, phoneName);
    if (!result.ok) return result;
    const desktop: SavedDesktop = {
      address: result.value,
      name: desktopName.trim() || 'My computer',
      pairedAt: new Date().toISOString(),
    };
    try {
      await saveDesktop(desktop);
    } catch {
      return {
        ok: false,
        code: 'storage_unavailable',
        message: 'Your computer paired this phone, but it could not be remembered. Pair again before closing the app.',
      };
    }
    backoff.reset();
    set({ desktop, phase: 'connecting', detail: null, notice: { tone: 'success', text: `Connected to ${desktop.name}.` } });
    return { ok: true, value: null };
  },

  async refresh() {
    if (!get().desktop) return;
    let remote: RemoteClient | null;
    try {
      remote = await ensureClient();
    } catch (error) {
      set({ phase: 'unreachable', detail: String(error) });
      schedule(backoff.next());
      return;
    }
    if (!remote) return;
    const view = await remote.inspect();
    if (view.ok) {
      backoff.reset();
      let screenshot = get().screenshot;
      if (usePreferences.getState().screenshots) {
        const shot = await remote.screenshot();
        screenshot = shot.ok ? shot.value : null;
      }
      set({ phase: 'connected', snapshot: view.value, screenshot, updatedAt: Date.now(), detail: null });
      schedule(usePreferences.getState().refreshMs);
      return;
    }
    const phase = phaseFor(view.code);
    set({ phase: phase === 'connected' ? get().phase : phase, detail: view.message });
    if (phase === 'revoked' || phase === 'incompatible') return; // needs the person, not a retry
    schedule(backoff.next());
  },

  startLive() {
    if (live) return;
    live = true;
    backoff.reset();
    void get().refresh();
  },

  stopLive() {
    live = false;
    if (timer) clearTimeout(timer);
    timer = null;
    // Leaving the foreground closes the endpoint: no background traffic.
    void resetClient();
  },

  async act(intent) {
    const remote = await ensureClient().catch(() => null);
    if (!remote) return false;
    set({ working: true });
    const result = await remote.act(intent);
    set({ working: false });
    if (!result.ok) {
      set({ notice: { tone: result.code === 'outcome_unknown' ? 'warning' : 'danger', text: result.message } });
    }
    void get().refresh();
    return result.ok;
  },

  async send(text, submit = true) {
    const remote = await ensureClient().catch(() => null);
    if (!remote) return false;
    set({ working: true });
    const result = await sendChatMessage(remote, text, { submit });
    set({ working: false });
    if (!result.ok) {
      set({ notice: { tone: result.failure?.partial ? 'warning' : 'danger', text: result.failure?.message ?? result.message } });
    }
    void get().refresh();
    return result.ok;
  },

  async stop() {
    const remote = await ensureClient().catch(() => null);
    if (!remote) return false;
    set({ working: true });
    const result = await stopWork(remote);
    set({ working: false });
    if (!result.ok) set({ notice: { tone: 'danger', text: result.message } });
    void get().refresh();
    return result.ok;
  },

  async forget() {
    get().stopLive();
    await deleteDesktop();
    set({
      desktop: null,
      phase: 'unpaired',
      snapshot: null,
      screenshot: null,
      detail: null,
      notice: { tone: 'info', text: 'Forgotten on this phone. Also choose Forget on your computer to revoke access there.' },
    });
  },

  dismissNotice() {
    set({ notice: null });
  },
}));
