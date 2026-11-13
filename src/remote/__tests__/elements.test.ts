import { conversationArea, readableText } from '../elements';
import type { InspectResult, UiElement } from '../wire';

function element(target: string, label: string | null, role: string | null, x: number, y: number, width = 100, height = 20): UiElement {
  return { target, label, role, visible: true, disabled: false, checked: null, selected: null, expanded: null, bounds: { x, y, width, height } };
}

function snapshot(elements: UiElement[]): InspectResult {
  return { elements, total: elements.length, truncated: false, appearance: 'dark', interface_scale_percent: 100, revision: 'r1' };
}

// Shapes taken from a live Sovra desktop Inspect of the chat screen.
const chat = snapshot([
  element('log', 'Conversation', 'Log', 280, 80, 976, 598),
  element('today', 'Today', 'Heading', 8, 611, 239, 26),
  element('title', 'Hello from the phone', null, 38, 643, 173, 21),
  element('reply', 'First, connect an AI', null, 445, 338, 646, 22),
  element('hint', 'Type / for skills · Enter to send', null, 606, 760, 324, 18),
]);

describe('conversation helpers', () => {
  it('finds the conversation log', () => {
    expect(conversationArea(chat)?.target).toBe('log');
    expect(conversationArea(snapshot([element('x', 'Settings', 'Button', 0, 0)]))).toBeNull();
  });

  it('reads only text inside the conversation when there is one', () => {
    expect(readableText(chat, conversationArea(chat)).map((e) => e.target)).toEqual(['reply']);
    expect(readableText(chat).map((e) => e.target)).toEqual(['reply', 'today', 'title', 'hint']);
  });
});
