/**
 * Compose and send a chat message through Sovra's real chat box, the way a person
 * would: focus the composer, type, press Enter. Each step re-inspects first. A
 * failed step stops the flow and says exactly what already landed; nothing is
 * replayed automatically.
 */
import type { Outcome, RemoteClient } from './client';
import { findComposer, findStop } from './elements';
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

export async function sendChatMessage(
  client: RemoteClient,
  text: string,
  options: { submit: boolean } = { submit: true },
): Promise<Outcome<null> & { failure?: SendFailure }> {
  const message = text.replace(/\0/g, '');
  if (!message.trim()) return { ok: false, code: 'invalid_request', message: 'Write a message first.' };

  const view = await client.inspect();
  if (!view.ok) return { ...view, failure: { stage: 'focus', message: view.message, partial: false } };
  const composer = findComposer(view.value);
  if (!composer) {
    const failure = 'There is no chat box on screen. Open a chat on your computer first.';
    return { ok: false, code: 'invalid_request', message: failure, failure: { stage: 'focus', message: failure, partial: false } };
  }
  const focus = await client.act({ kind: 'click', element: composer });
  if (!focus.ok) return { ...focus, failure: { stage: 'focus', message: focus.message, partial: false } };

  let typedAny = false;
  for (const step of planTyping(message)) {
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

/** Press Sovra's visible Stop control; falls back to Escape when none is shown. */
export async function stopWork(client: RemoteClient): Promise<Outcome<null>> {
  const view = await client.inspect();
  if (!view.ok) return view;
  const stop = findStop(view.value);
  const result = stop ? await client.act({ kind: 'click', element: stop }) : await client.act({ kind: 'key', key: 'escape' });
  return result.ok ? { ok: true, value: null } : result;
}
