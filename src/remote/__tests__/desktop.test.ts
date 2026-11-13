import { chatList, findNavigation, pageFirst, pages, transcript } from '../desktop';
import type { InspectResult, UiElement } from '../wire';

function element(target: string, label: string | null, role: string | null, x: number, y: number, width = 100, height = 20): UiElement {
  return { target, label, role, visible: true, disabled: false, checked: null, selected: null, expanded: null, bounds: { x, y, width, height } };
}

function snapshot(elements: UiElement[]): InspectResult {
  return { elements, total: elements.length, truncated: false, appearance: 'dark', interface_scale_percent: 100, revision: 'r1' };
}

// Shapes and labels taken from live Sovra desktop inspections.
const sidebar = [
  element('new', 'Start a fresh conversation', 'Button', 8, 124, 239, 36),
  element('nav-chat', 'Chat', 'Button', 8, 168, 239, 28),
  element('nav-skills', 'Skills', 'Button', 8, 198, 239, 28),
  element('filter', 'Chats', 'Button', 10, 577, 116, 28),
  element('today', 'Today', 'Heading', 8, 611, 239, 26),
  element('c1', 'Open conversation Second message from the phone', 'Button', 8, 639, 239, 49),
  element('c1-title', 'Second message from the phone', null, 38, 643, 184, 21),
  element('c2', 'Open conversation Plan the launch', 'Button', 8, 690, 239, 49),
];

describe('reading Sovra on the computer', () => {
  it('reads the conversation as messages, in order', () => {
    const view = snapshot([
      ...sidebar,
      element('log', 'Conversation', 'Log', 280, 80, 976, 598),
      element('a1', 'Hi! How can I help?', 'Article', 400, 300, 600, 40),
      element('u1', 'What is on my calendar?', 'Comment', 700, 120, 300, 30),
      element('writing', 'Sovra is writing', 'Status', 400, 400, 100, 20),
    ]);
    expect(transcript(view)).toEqual({
      messages: [
        { id: 'u1', from: 'you', text: 'What is on my calendar?' },
        { id: 'a1', from: 'sovra', text: 'Hi! How can I help?' },
      ],
      earlier: false,
      working: 'Sovra is writing',
    });
  });

  it('lists the open page’s controls before the sidebar, without the page shortcuts', () => {
    const browse = element('browse', 'Browse all models', 'Button', 900, 70);
    const phone = element('phone', 'Phone control is on. Open phone controls', 'Button', 976, 0);
    const view = snapshot([...sidebar, browse, phone]);
    const ordered = pageFirst(view, [phone, sidebar[0], sidebar[1], sidebar[2], browse]).map((entry) => entry.target);
    expect(ordered).toEqual(['browse', 'phone', 'new']);
  });

  it('knows when the conversation continues above what is shown', () => {
    const view = snapshot([
      element('log', 'Conversation', 'Log', 280, 80, 976, 598),
      element('a0', 'A long earlier answer', 'Article', 400, 20, 600, 200),
      element('u1', 'Thanks', 'Comment', 700, 300, 300, 30),
    ]);
    expect(transcript(view).earlier).toBe(true);
  });

  it('keeps a long reply that is partly scrolled out of the conversation', () => {
    const view = snapshot([
      element('log', 'Conversation', 'Log', 280, 34, 976, 644),
      element('a1', 'A long comparison…', 'Article', 444, -160, 692, 423),
      element('off', 'Elsewhere', 'Article', 1300, 900, 100, 20),
    ]);
    expect(transcript(view).messages.map((m) => m.id)).toEqual(['a1']);
  });

  it('lists the chats shown in the sidebar', () => {
    expect(chatList(snapshot(sidebar)).map((chat) => chat.title)).toEqual(['Second message from the phone', 'Plan the launch']);
  });

  it('lists the sidebar pages (not New chat, chats or the tour)', () => {
    const view = snapshot([
      ...sidebar,
      element('team', 'Team', 'Button', 8, 228, 239, 28),
      element('settings', 'Settings', 'Button', 8, 496, 239, 28),
      element('tour', 'Take a guided tour', 'Button', 8, 702, 239, 36),
    ]);
    expect(pages(view).map((page) => page.label)).toEqual(['Chat', 'Skills', 'Team', 'Settings']);
    expect(pages(snapshot([element('x', 'Settings', 'Button', 0, 0)]))).toEqual([]);
  });

  it('finds sidebar destinations by exact label only', () => {
    const view = snapshot(sidebar);
    expect(findNavigation(view, 'Chat')?.target).toBe('nav-chat');
    expect(findNavigation(view, 'Skills')?.target).toBe('nav-skills');
    expect(findNavigation(view, 'Team')).toBeNull();
  });

});
