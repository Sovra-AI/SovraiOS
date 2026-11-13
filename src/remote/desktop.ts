/**
 * Reads Sovra's own screens out of an Inspect snapshot so the phone can show them
 * natively: the conversation, the chat list and the sidebar pages. Pure and
 * label-based; never parses target IDs. Shapes match the desktop's accessibility tree
 * (messages: `Comment` = you, `Article` = Sovra; chats: "Open conversation …" buttons).
 * The `/` skills are read in `skills.ts`.
 */
import { conversationArea } from './elements';
import type { InspectResult, UiElement } from './wire';

export interface Message {
  id: string;
  from: 'you' | 'sovra';
  text: string;
}

export interface Transcript {
  messages: Message[];
  /** The conversation continues above what the computer is showing. */
  earlier: boolean;
  /** Sovra's own status line while it works ("Sovra is writing"), if shown. */
  working: string | null;
}

export interface ChatEntry {
  title: string;
  element: UiElement;
  /** On screen in Sovra's sidebar (others are just outside its scrolled list). */
  shown: boolean;
}

const byReadingOrder = (a: UiElement, b: UiElement) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x;
const visible = (snapshot: InspectResult) => snapshot.elements.filter((element) => element.visible);

function overlaps(a: UiElement, b: UiElement): boolean {
  const p = a.bounds;
  const q = b.bounds;
  return p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
}

export function transcript(snapshot: InspectResult): Transcript {
  const area = conversationArea(snapshot);
  // Overlap, not containment: a long reply can be partly scrolled out of the conversation.
  const shown = visible(snapshot).filter((element) => !area || overlaps(area, element));
  const bubbles = shown.filter((element) => (element.role === 'Comment' || element.role === 'Article') && element.label?.trim()).sort(byReadingOrder);
  const earlier = area !== null && bubbles.length > 0 && bubbles[0].bounds.y < area.bounds.y - 1;
  const messages = bubbles
    .map((element) => ({ id: element.target, from: element.role === 'Comment' ? ('you' as const) : ('sovra' as const), text: element.label!.trim() }));
  const status = shown.find((element) => element.role === 'Status' && element.label?.trim());
  return { messages, earlier, working: status?.label?.trim() ?? null };
}

const OPEN_CONVERSATION = 'Open conversation ';

/**
 * The chats Sovra's sidebar has rendered: the ones on screen plus the few it keeps just
 * outside its scrolled list. Older chats appear as the list scrolls, or by searching.
 */
export function chatList(snapshot: InspectResult): ChatEntry[] {
  const seen = new Set<string>();
  return snapshot.elements
    .filter((element) => element.role === 'Button' && element.label?.startsWith(OPEN_CONVERSATION))
    .sort(byReadingOrder)
    .map((element) => ({ title: element.label!.slice(OPEN_CONVERSATION.length).trim(), element, shown: element.visible }))
    .filter((chat) => !seen.has(chat.element.target) && seen.add(chat.element.target) && chat.title.length > 0);
}

export const CHAT_SEARCH_LABEL = 'Search chats';

/** A sidebar destination by its exact label ("Chat", "Skills"…). */
export function findNavigation(snapshot: InspectResult, label: string): UiElement | null {
  const wanted = label.toLowerCase();
  return (
    visible(snapshot).find(
      (element) => element.role === 'Button' && element.disabled !== true && element.label?.trim().toLowerCase() === wanted,
    ) ?? null
  );
}

/**
 * Sovra's sidebar pages (Chat, Skills, Team, Artifacts, Schedules, Groups, Models, …,
 * Settings): buttons laid out exactly like the "Chat" entry — same column, width and row height.
 */
export function pages(snapshot: InspectResult): UiElement[] {
  const chat = findNavigation(snapshot, 'Chat');
  if (!chat) return [];
  const same = (a: number, b: number) => Math.abs(a - b) <= 1;
  return visible(snapshot)
    .filter(
      (element) =>
        element.role === 'Button' &&
        element.label?.trim() &&
        same(element.bounds.x, chat.bounds.x) &&
        same(element.bounds.width, chat.bounds.width) &&
        same(element.bounds.height, chat.bounds.height),
    )
    .sort(byReadingOrder);
}

export const NEW_CHAT_LABEL = 'Start a fresh conversation';

/** Sovra's window bar (title, "Phone control is on", "Development mode") above every page. */
const WINDOW_BAR_HEIGHT = 34;

/**
 * Controls in the order a person looks for them: the open page first, then Sovra's
 * sidebar and window bar (the page shortcuts are already a row of their own).
 */
export function pageFirst(snapshot: InspectResult, controls: UiElement[]): UiElement[] {
  const chat = findNavigation(snapshot, 'Chat');
  if (!chat) return controls;
  const sidebarEnd = chat.bounds.x + chat.bounds.width;
  const shortcuts = new Set(pages(snapshot).map((page) => page.target));
  const rest = controls.filter((element) => !shortcuts.has(element.target));
  const onPage = (element: UiElement) => element.bounds.x >= sidebarEnd && element.bounds.y >= WINDOW_BAR_HEIGHT;
  return [...rest.filter(onPage), ...rest.filter((element) => !onPage(element))];
}
