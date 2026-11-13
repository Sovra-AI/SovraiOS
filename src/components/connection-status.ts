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
