/**
 * Compose and send a chat message through Sovra's real chat box, the way a person
 * would: focus the composer, clear it, type, press Enter. Each step re-inspects first. A
 * failed step stops the flow and says exactly what already landed; nothing is
 * replayed automatically.
 */
import type { ElementRef, Outcome, RemoteClient } from './client';
import { findChatNavigation, findComposer, findStop } from './elements';
import { MAX_TEXT_BYTES, utf8Length } from './wire';

export type SendStage = 'focus' | 'type' | 'send';

export interface SendFailure {
  stage: SendStage;
  message: string;
  /** True when some of the text may already be in the chat box on the computer. */
  partial: boolean;
}

/** Split text into typeable chunks: newlines become Shift+Enter, chunks fit the 4 KiB limit. */
export function planTyping(text: string): ({ kind: 'type'; text: string } | { kind: 'key'; key: string })[] {
  const steps: ({ kind: 'type'; text: string } | { kind: 'key'; key: string })[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, index) => {
    if (index > 0) steps.push({ kind: 'key', key: 'shift-enter' });
    let chunk = '';
    for (const character of Array.from(line)) {
      if (utf8Length(chunk + character) > MAX_TEXT_BYTES) {
        steps.push({ kind: 'type', text: chunk });
        chunk = '';
      }
      chunk += character;
    }
    if (chunk) steps.push({ kind: 'type', text: chunk });
  });
  return steps;
}

/**
 * A lone "/table" leaves Sovra's `/` menu open, where Enter only completes the name.
 * A trailing space closes the menu, so Enter runs the skill (or Sovra explains what it needs).
 */
export function bareCommand(text: string): string {
  return /^\s*\/[A-Za-z0-9-]+$/.test(text) ? `${text} ` : text;
}

export async function sendChatMessage(
  client: RemoteClient,
  text: string,
  options: { submit: boolean } = { submit: true },
): Promise<Outcome<null> & { failure?: SendFailure }> {
  const message = text.replace(/\0/g, '');
  if (!message.trim()) return { ok: false, code: 'invalid_request', message: 'Write a message first.' };

  let view = await client.inspect();
  if (!view.ok) return { ...view, failure: { stage: 'focus', message: view.message, partial: false } };
  let composer = findComposer(view.value);
  if (!composer) {
    // Somewhere else in Sovra (Settings, Skills…): open Chat through its real control, then look again.
    const chat = findChatNavigation(view.value);
    if (chat) {
      const opened = await client.act({ kind: 'click', element: chat });
      if (!opened.ok) return { ...opened, failure: { stage: 'focus', message: opened.message, partial: false } };
      view = await client.inspect();
      if (!view.ok) return { ...view, failure: { stage: 'focus', message: view.message, partial: false } };
      composer = findComposer(view.value);
    }
  }
  if (!composer) {
    const failure = 'There is no chat box on screen. Open a chat on your computer first.';
    return { ok: false, code: 'invalid_request', message: failure, failure: { stage: 'focus', message: failure, partial: false } };
  }
  const focus = await client.act({ kind: 'click', element: composer });
  if (!focus.ok) return { ...focus, failure: { stage: 'focus', message: focus.message, partial: false } };
  // The phone's text is the whole message: clear anything left in the chat box there first.
  for (const key of ['secondary-a', 'backspace']) {
    const cleared = await client.act({ kind: 'key', key });
    if (!cleared.ok) return { ...cleared, failure: { stage: 'focus', message: cleared.message, partial: false } };
  }

  let typedAny = false;
  for (const step of planTyping(bareCommand(message))) {
    const result = await client.act(step);
    if (!result.ok) {
      return { ...result, failure: { stage: 'type', message: result.message, partial: typedAny || result.code === 'outcome_unknown' } };
    }
    typedAny = true;
  }

  if (options.submit) {
    const sent = await client.act({ kind: 'key', key: 'enter' });
    if (!sent.ok) {
      return {
        ...sent,
        failure: { stage: 'send', message: `Your text is in the chat box on your computer but may not be sent: ${sent.message}`, partial: true },
      };
    }
  }
  return { ok: true, value: null };
}

/** Type into one particular field on the computer (a form box, a search box), without pressing Enter. */
export async function typeInto(client: RemoteClient, field: ElementRef, text: string): Promise<Outcome<null>> {
  const message = text.replace(/\0/g, '');
  if (!message) return { ok: false, code: 'invalid_request', message: 'Write something first.' };
  const focus = await client.act({ kind: 'click', element: field });
  if (!focus.ok) return focus;
  for (const step of planTyping(message)) {
    const result = await client.act(step);
    if (!result.ok) return result;
  }
  return { ok: true, value: null };
}

/** Press Sovra's visible Stop control; falls back to Escape when none is shown. */
export async function stopWork(client: RemoteClient): Promise<Outcome<null>> {
  const view = await client.inspect();
  if (!view.ok) return view;
  const stop = findStop(view.value);
  const result = stop ? await client.act({ kind: 'click', element: stop }) : await client.act({ kind: 'key', key: 'escape' });
  return result.ok ? { ok: true, value: null } : result;
}
