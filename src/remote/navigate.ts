/**
 * Moves around Sovra on the computer the way a person would: sidebar destinations,
 * the chat list and its search box, opening a chat. Every step is a real, revision-guarded
 * click or keystroke; nothing is replayed if a step fails.
 */
import type { Outcome, RemoteClient } from './client';
import { CHAT_SEARCH_LABEL, chatList, findNavigation } from './desktop';
import { findComposer } from './elements';
import type { InspectResult, UiElement } from './wire';

function overlaps(a: UiElement, b: UiElement): boolean {
  const p = a.bounds;
  const q = b.bounds;
  return p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
}

function within(outer: UiElement, inner: UiElement): boolean {
  const p = outer.bounds;
  const q = inner.bounds;
  return q.x >= p.x && q.y >= p.y && q.x + q.width <= p.x + p.width && q.y + q.height <= p.y + p.height;
}

/** Another control (e.g. the sidebar footer) sits over part of this one, so its centre may not be clickable. */
function covered(view: InspectResult, row: UiElement): boolean {
  return view.elements.some(
    (element) => element !== row && element.visible && element.role === 'Button' && !within(row, element) && overlaps(row, element),
  );
}

const MAX_CHAT_SCROLLS = 8;

/** Replace the text in a text box on the computer (empty clears it). */
async function fillBox(client: RemoteClient, box: UiElement, query: string): Promise<Outcome<null>> {
  // "secondary" is Cmd on macOS and Ctrl elsewhere (GPUI keystroke syntax).
  for (const step of [
    { kind: 'click', element: box },
    { kind: 'key', key: 'secondary-a' },
    { kind: 'key', key: 'backspace' },
  ] as const) {
    const result = await client.act(step);
    if (!result.ok) return result;
  }
  const text = query.replace(/\0/g, '').trim();
  if (text) {
    const typed = await client.act({ kind: 'type', text });
    if (!typed.ok) return typed;
  }
  return { ok: true, value: null };
}

function chatSearchBox(view: InspectResult): UiElement | null {
  return view.elements.find((element) => element.visible && element.label === CHAT_SEARCH_LABEL) ?? null;
}

/** Filter Sovra's chat list by words in the title (empty shows every chat again). */
export async function searchChats(client: RemoteClient, query: string): Promise<Outcome<InspectResult>> {
  const view = await client.inspect();
  if (!view.ok) return view;
  const box = chatSearchBox(view.value);
  if (!box) return { ok: false, code: 'invalid_request', message: 'The chat list is not showing on your computer.' };
  const filled = await fillBox(client, box, query);
  if (!filled.ok) return filled;
  return client.inspect();
}

/** Scroll Sovra's chat list so older chats come into view. */
export async function moreChats(client: RemoteClient): Promise<Outcome<InspectResult>> {
  const view = await client.inspect();
  if (!view.ok) return view;
  const shown = chatList(view.value).filter((chat) => chat.shown && !covered(view.value, chat.element));
  const anchor = shown[shown.length - 1]?.element;
  if (!anchor) return { ok: false, code: 'invalid_request', message: 'The chat list is not showing on your computer.' };
  const scrolled = await client.act({ kind: 'scroll', element: anchor, lines: -6 });
  if (!scrolled.ok) return scrolled;
  return client.inspect();
}

/**
 * Open a chat from Sovra's sidebar by its title. A row outside the scrolled list, or
 * half-hidden under the footer (Inspect reports unclipped bounds), is scrolled into view
 * over a fully visible row first; a chat that is not rendered at all is found by search.
 */
export async function openConversation(client: RemoteClient, title: string): Promise<Outcome<null>> {
  let searched = false;
  for (let attempt = 0; attempt <= MAX_CHAT_SCROLLS; attempt++) {
    const view = await client.inspect();
    if (!view.ok) return view;
    const rows = chatList(view.value);
    const row = rows.find((chat) => chat.title === title);
    const anchor = rows.find((chat) => chat.shown && !covered(view.value, chat.element))?.element;
    if (row && row.shown && !covered(view.value, row.element)) {
      const opened = await client.act({ kind: 'click', element: row.element });
      if (!opened.ok) return opened;
      if (searched) {
        // Show the whole list again; the chat stays open.
        const after = await client.inspect();
        const box = after.ok ? chatSearchBox(after.value) : null;
        if (box) await fillBox(client, box, '');
      }
      return { ok: true, value: null };
    }
    if (row && anchor && attempt < MAX_CHAT_SCROLLS) {
      const down = row.element.bounds.y > anchor.bounds.y;
      const scrolled = await client.act({ kind: 'scroll', element: anchor, lines: down ? -2 : 2 });
      if (!scrolled.ok) return scrolled;
      continue;
    }
    if (searched) break;
    const box = chatSearchBox(view.value);
    if (!box) break;
    const filled = await fillBox(client, box, title);
    if (!filled.ok) return filled;
    searched = true;
  }
  return { ok: false, code: 'invalid_request', message: 'Could not find that chat on your computer. It may have been deleted.' };
}

/** Show Sovra's chat (the conversation and its chat box) if another page is open. */
export async function openChatPage(client: RemoteClient): Promise<Outcome<InspectResult>> {
  const view = await client.inspect();
  if (!view.ok || findComposer(view.value)) return view;
  const nav = findNavigation(view.value, 'Chat');
  if (!nav) return { ok: false, code: 'invalid_request', message: 'Chat is not reachable from this screen on your computer.' };
  const opened = await client.act({ kind: 'click', element: nav });
  if (!opened.ok) return opened;
  return client.inspect();
}
