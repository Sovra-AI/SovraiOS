/**
 * Sovra's `/` skills, read from the desktop's own slash menu. Typing `/` in Sovra's chat
 * box lists every enabled skill as a button labelled "/name. description <hint>" — the
 * whole list, including rows scrolled out of view — so the phone can offer the same menu.
 */
import type { Outcome, RemoteClient } from './client';
import { findChatNavigation, findComposer } from './elements';
import type { InspectResult } from './wire';

export interface Skill {
  /** Command name without the slash: "web-search". */
  name: string;
  /** Readable name: "Web search". */
  title: string;
  description: string;
  /** What to write after the command ("<question>"), empty when nothing is needed. */
  hint: string;
}

const ENTRY = /^\/([a-z0-9][a-z0-9-]*)\.\s?([\s\S]*)$/;
const HINT = /\s*((?:[<[][^<>[\]]*[>\]]\s*)+)$/;

export function titleOf(name: string): string {
  const words = name.split('-').filter(Boolean);
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Every skill in the desktop's open `/` menu, in its order. */
export function readSkillMenu(snapshot: InspectResult): Skill[] {
  const seen = new Set<string>();
  const skills: Skill[] = [];
  for (const element of snapshot.elements) {
    if (element.role !== 'Button' || !element.label) continue;
    const entry = ENTRY.exec(element.label.trim());
    if (!entry || seen.has(entry[1])) continue;
    seen.add(entry[1]);
    const rest = entry[2].trim();
    const hint = HINT.exec(rest);
    skills.push({
      name: entry[1],
      title: titleOf(entry[1]),
      // Specialist skills describe themselves to the AI; keep the part people need.
      description: (hint ? rest.slice(0, hint.index) : rest).replace(SPECIALIST, '').trim(),
      hint: hint ? hint[1].trim() : '',
    });
  }
  return skills;
}

/** A skill that cannot run without text after it (`<…>`; `[…]` is optional). */
export function needsText(skill: Skill): boolean {
  return skill.hint.includes('<');
}

/** The hint in plain words: "<what to present>" → "what to present". */
export function hintText(skill: Skill): string {
  return skill.hint.replace(/[<>[\]]/g, '').replace(/\s+/g, ' ').trim();
}

/** A prompt for the chat box: "<question>" → "Your question…", "<what to present>" → "What to present…". */
export function hintPrompt(skill: Skill): string {
  const hint = hintText(skill);
  if (!hint) return 'Add details, or just tap Send';
  const question = /^(what|which|who|how|where|when)\b/i.test(hint);
  const text = question ? hint : `your ${hint}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}…`;
}

const SPECIALIST = /^Consult this specialist when you need help with:\s*/i;

/** The same ranking as the desktop menu: exact, prefix, word, contains, description. */
export function matchSkills(skills: Skill[], query: string): Skill[] {
  const wanted = query.trim().replace(/^\//, '').toLowerCase();
  if (!wanted) return skills;
  const score = (skill: Skill): number | null => {
    const title = skill.title.toLowerCase();
    if (skill.name === wanted) return 0;
    if (skill.name.startsWith(wanted)) return 1;
    if (title.split(/\s+/).some((word) => word.startsWith(wanted))) return 3;
    if (skill.name.includes(wanted) || title.includes(wanted)) return 4;
    if (wanted.length >= 3 && skill.description.toLowerCase().includes(wanted)) return 5;
    return null;
  };
  return skills
    .map((skill, index) => ({ skill, index, rank: score(skill) }))
    .filter((entry): entry is { skill: Skill; index: number; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.skill);
}

/** "/web" while still typing the command (no space yet) → "web"; otherwise null. */
export function slashQuery(draft: string): string | null {
  const match = /^\s*\/([A-Za-z0-9-]*)$/.exec(draft);
  return match ? match[1] : null;
}

/** Sovra's message about the last `/` command ("Usage: /table <what to present>"). */
export function skillNotice(snapshot: InspectResult): string | null {
  const alert = snapshot.elements.find((element) => element.visible && element.role === 'Alert' && element.label?.trim());
  return alert?.label?.trim() ?? null;
}

/** Turn the desktop's terse skill notices into plain words for the phone. */
export function explainNotice(notice: string): string {
  const usage = /^Usage: \/([a-z0-9-]+)\s*(.*)$/.exec(notice);
  if (usage) {
    const what = usage[2].replace(/[<>[\]]/g, '').trim();
    return what ? `${titleOf(usage[1])} needs a little more: tell it ${what}.` : `${titleOf(usage[1])} needs a little more text.`;
  }
  return notice;
}

async function clearComposer(client: RemoteClient): Promise<Outcome<null>> {
  // "secondary" is Cmd on macOS and Ctrl elsewhere (GPUI keystroke syntax).
  for (const key of ['secondary-a', 'backspace']) {
    const result = await client.act({ kind: 'key', key });
    if (!result.ok) return result;
  }
  return { ok: true, value: null };
}

/**
 * Read the skills by opening Sovra's `/` menu on the computer, then leave the chat box
 * empty again. Opens Chat first when another page is showing.
 */
export async function loadSkills(client: RemoteClient): Promise<Outcome<Skill[]>> {
  let view = await client.inspect();
  if (!view.ok) return view;
  if (!findComposer(view.value)) {
    const chat = findChatNavigation(view.value);
    if (!chat) return { ok: false, code: 'invalid_request', message: 'Open a chat on your computer to see the skills.' };
    const opened = await client.act({ kind: 'click', element: chat });
    if (!opened.ok) return opened;
    view = await client.inspect();
    if (!view.ok) return view;
  }
  const composer = findComposer(view.value);
  if (!composer) return { ok: false, code: 'invalid_request', message: 'Open a chat on your computer to see the skills.' };
  const focus = await client.act({ kind: 'click', element: composer });
  if (!focus.ok) return focus;
  const cleared = await clearComposer(client);
  if (!cleared.ok) return cleared;
  const typed = await client.act({ kind: 'type', text: '/' });
  if (!typed.ok) return typed;
  // The menu appears on Sovra's next frame; look again briefly rather than give up.
  let skills: Skill[] = [];
  for (let attempt = 0; attempt < MENU_LOOKS && skills.length === 0; attempt++) {
    if (attempt > 0) await wait(MENU_WAIT_MS);
    const menu = await client.inspect();
    if (!menu.ok) {
      await clearComposer(client);
      return menu;
    }
    skills = readSkillMenu(menu.value);
  }
  const emptied = await clearComposer(client);
  if (!emptied.ok) return emptied;
  if (skills.length === 0) return { ok: false, code: 'invalid_request', message: 'Sovra did not list its skills. Try again.' };
  return { ok: true, value: skills };
}

const MENU_LOOKS = 4;
const MENU_WAIT_MS = 250;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
