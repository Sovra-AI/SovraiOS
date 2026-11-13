/**
 * Plain words for the connection: what the phone is doing right now, how long it has
 * been trying, and what to check. Pure, so the wording is tested without rendering.
 */
import type { Route } from '@/remote/transport';
import type { ConnectionProgress } from '@/state/remote';

/** After this long without an answer, say why it may be slow. */
const SLOW_MS = 6000;
/** From this attempt on, list what to check on the computer. */
const CHECKLIST_ATTEMPT = 3;

export type StepState = 'done' | 'active' | 'todo';

export interface ConnectionView {
  title: string;
  /** "Trying for 12 s · attempt 3", or the retry countdown. */
  status: string;
  steps: { label: string; detail: string; state: StepState }[];
  /** A hint for slow or repeated failures; null while things look normal. */
  hint: string | null;
  /** Offer "Try now": only while waiting between tries. */
  canRetryNow: boolean;
}

function seconds(ms: number): number {
  return Math.max(0, Math.round(ms / 1000));
}

export function describeConnection(progress: ConnectionProgress, computer: string, now: number, lastError: string | null): ConnectionView {
  const waiting = progress.step === 'waiting';
  const elapsed = seconds(now - progress.since);
  const attempt = progress.attempt > 1 ? ` · attempt ${progress.attempt}` : '';
  const status =
    waiting && progress.retryAt !== null
      ? `Trying again in ${Math.max(1, seconds(progress.retryAt - now))} s${attempt}`
      : `Trying for ${elapsed} s${attempt}`;
  const started = progress.step !== 'starting';
  const steps: ConnectionView['steps'] = [
    {
      label: started ? 'Secure connection ready' : 'Starting a secure connection',
      detail: 'End-to-end encrypted with this phone’s own key.',
      state: started ? 'done' : 'active',
    },
    {
      label: waiting ? `${computer} didn’t answer` : `Reaching ${computer}`,
      detail: waiting && lastError
        ? lastError
        : progress.attempt > 1 && lastError
          ? `Last try: ${lastError}`
          : 'Directly on the same Wi-Fi, or over the internet through an encrypted relay.',
      state: started ? 'active' : 'todo',
    },
  ];
  let hint: string | null = null;
  if (progress.attempt >= CHECKLIST_ATTEMPT) {
    hint =
      'Check that your computer is awake and online, Sovra is open, and “Use Sovra from your phone” is on in Sovra. It switches off whenever Sovra restarts.';
  } else if (now - progress.since >= SLOW_MS) {
    hint = 'This can take a little longer on mobile data or a new network.';
  }
  return {
    title: waiting ? `Can’t reach ${computer} yet` : `Connecting to ${computer}…`,
    status,
    steps,
    hint,
    canRetryNow: waiting,
  };
}

/** A quick reconnect (back from another app) should not flash the card. */
const QUIET_MS = 1500;

/** Show the progress card only once a try is slow, has failed, or is a retry. */
export function showConnectionCard(progress: ConnectionProgress, now: number): boolean {
  return progress.step === 'waiting' || progress.attempt > 1 || now - progress.since >= QUIET_MS;
}

/** The status line once connected. */
export function routeLabel(route: Route | null): string {
  switch (route) {
    case 'direct':
      return 'Connected directly';
    case 'relay':
      return 'Connected through an encrypted relay';
    default:
      return 'Connected';
  }
}

/** While pairing: one line that keeps moving, so a slow network never looks frozen. */
export function pairingStatus(elapsedMs: number): string {
  const elapsed = seconds(elapsedMs);
  if (elapsedMs >= SLOW_MS) return `Pairing securely with your computer… ${elapsed} s. Over mobile data or a new network this can take a little longer.`;
  return elapsed > 0 ? `Pairing securely with your computer… ${elapsed} s` : 'Pairing securely with your computer…';
}

/** One line per fact in the transport's diagnostics JSON, for Developer mode. */
export function diagnosticLines(json: string | null): string[] {
  if (!json) return ['No transport report yet.'];
  let report: Record<string, unknown>;
  try {
    report = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return ['Unreadable transport report.'];
  }
  if (typeof report.error === 'string') return [`Report failed: ${report.error}`];
  const lines: string[] = [];
  if (report.relaysEnabled === false) lines.push('Relays: off (Same Wi-Fi only)');
  const relays = Array.isArray(report.relays) ? (report.relays as { url?: string; connected?: boolean; error?: string | null }[]) : [];
  if (report.relaysEnabled !== false && relays.length === 0) lines.push('Relay: none yet (this phone has not reached any relay)');
  for (const relay of relays) {
    const host = (relay.url ?? '').replace(/^https:\/\//, '').replace(/\.?\/$/, '');
    lines.push(`Relay ${host}: ${relay.connected ? 'connected' : 'not connected'}${relay.error ? ` (${relay.error})` : ''}`);
  }
  const direct = Array.isArray(report.direct) ? (report.direct as string[]) : [];
  lines.push(`This phone's direct addresses: ${direct.length > 0 ? direct.join(', ') : 'none'}`);
  const dns = report.dns as { host?: string; phone?: { addresses?: number; ms?: number }; builtin?: { addresses?: number; error?: string; ms?: number } } | null;
  if (dns) {
    lines.push(`DNS ${dns.host}: phone resolver ${dns.phone?.addresses ?? 0} address(es) in ${dns.phone?.ms ?? 0} ms`);
    lines.push(
      dns.builtin?.error
        ? `DNS ${dns.host}: built-in resolver failed after ${dns.builtin.ms ?? 0} ms (${dns.builtin.error})`
        : `DNS ${dns.host}: built-in resolver ${dns.builtin?.addresses ?? 0} address(es) in ${dns.builtin?.ms ?? 0} ms`,
    );
  }
  return lines;
}

/**
 * Shortens one tracing line for a phone screen: time without the date, level, and the
 * message with its innermost span (`2026-…T14:57:55.674Z DEBUG a:b:c{…}: iroh_relay::x: msg`).
 */
export function shortLogLine(line: string): string {
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2}\.\d{3})\d*Z\s+(\w+)\s+(.*)$/.exec(line);
  if (!match) return line;
  const [, time, level, rest] = match;
  // Drop the span path before the target ("endpoint{…}:relay-actor:…: "), keep target and message.
  const target = /(?:^|: )((?:[a-z_][a-z0-9_]*::)*[a-z_][a-z0-9_]*): (.*)$/.exec(rest);
  return `${time} ${level.slice(0, 1)} ${target ? `${target[1].replace(/^iroh(_relay)?::/, '')}: ${target[2]}` : rest}`;
}
