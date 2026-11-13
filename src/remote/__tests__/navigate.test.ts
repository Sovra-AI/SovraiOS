import { RemoteClient } from '../client';
import { moreChats, openChatPage, openConversation, searchChats } from '../navigate';
import { FakeDesktop, desktopAddress } from './fake-desktop';

function pairedClient(desktop: FakeDesktop) {
  desktop.paired.add('ab'.repeat(32));
  return new RemoteClient(desktop.transport(), desktopAddress);
}

describe('driving Sovra’s screens from the phone', () => {
  it('scrolls a chat out from under the sidebar footer before opening it', async () => {
    const desktop = new FakeDesktop();
    const first = desktop.element('c1', 'Open conversation Plan my week', 'Button', 593);
    first.bounds = { x: 8, y: 593, width: 239, height: 49 };
    const second = desktop.element('c2', 'Open conversation What can you do?', 'Button', 674);
    second.bounds = { x: 8, y: 674, width: 239, height: 49 };
    desktop.element('tour', 'Take a guided tour', 'Button', 702).bounds = { x: 8, y: 702, width: 239, height: 36 };
    desktop.onDeliver = (input) => {
      if (input.action === 'scroll') for (const row of [first, second]) row.bounds = { ...row.bounds, y: row.bounds.y - 60 };
    };
    const result = await openConversation(pairedClient(desktop), 'What can you do?');
    expect(result.ok).toBe(true);
    expect(desktop.delivered).toEqual([
      { action: 'scroll', target: 'c1', lines: -2 },
      { action: 'click', target: 'c2' },
    ]);
  });

  it('opens a visible chat directly', async () => {
    const desktop = new FakeDesktop();
    desktop.element('c1', 'Open conversation Plan my week', 'Button', 593).bounds.height = 49;
    expect((await openConversation(pairedClient(desktop), 'Plan my week')).ok).toBe(true);
    expect(desktop.delivered).toEqual([{ action: 'click', target: 'c1' }]);
  });

  it('scrolls down to a chat Sovra keeps just outside its list', async () => {
    const desktop = new FakeDesktop();
    const first = desktop.element('c1', 'Open conversation Plan my week', 'Button', 593);
    first.bounds = { x: 8, y: 593, width: 239, height: 49 };
    const hidden = desktop.element('c2', 'Open conversation Older chat', 'Button', 753);
    hidden.bounds = { x: 8, y: 753, width: 239, height: 49 };
    hidden.visible = false;
    desktop.onDeliver = (input) => {
      if (input.action !== 'scroll') return;
      for (const row of [first, hidden]) row.bounds = { ...row.bounds, y: row.bounds.y - 100 };
      hidden.visible = true;
      first.visible = false;
    };
    expect((await openConversation(pairedClient(desktop), 'Older chat')).ok).toBe(true);
    expect(desktop.delivered).toEqual([
      { action: 'scroll', target: 'c1', lines: -2 },
      { action: 'click', target: 'c2' },
    ]);
  });

  it('finds a chat that is not in the list by searching, then clears the search', async () => {
    const desktop = new FakeDesktop();
    desktop.element('search', 'Search chats', 'TextInput', 498);
    desktop.element('c1', 'Open conversation Plan my week', 'Button', 593).bounds.height = 49;
    desktop.onDeliver = (input) => {
      if (input.action === 'type' && input.text === 'Holiday ideas') desktop.element('c9', 'Open conversation Holiday ideas', 'Button', 593).bounds.height = 49;
    };
    expect((await openConversation(pairedClient(desktop), 'Holiday ideas')).ok).toBe(true);
    expect(desktop.delivered).toEqual([
      { action: 'click', target: 'search' },
      { action: 'key', key: 'secondary-a' },
      { action: 'key', key: 'backspace' },
      { action: 'type', text: 'Holiday ideas' },
      { action: 'click', target: 'c9' },
      { action: 'click', target: 'search' },
      { action: 'key', key: 'secondary-a' },
      { action: 'key', key: 'backspace' },
    ]);
  });

  it('says so when a chat cannot be found at all', async () => {
    const desktop = new FakeDesktop();
    desktop.element('search', 'Search chats', 'TextInput', 498);
    const result = await openConversation(pairedClient(desktop), 'Gone');
    expect(result).toMatchObject({ ok: false });
    expect(desktop.delivered.filter((input) => input.action === 'click' && input.target !== 'search')).toEqual([]);
  });

  it('searches and scrolls the chat list', async () => {
    const desktop = new FakeDesktop();
    desktop.element('search', 'Search chats', 'TextInput', 498);
    desktop.element('c1', 'Open conversation Plan my week', 'Button', 593).bounds.height = 49;
    const client = pairedClient(desktop);
    expect((await searchChats(client, 'plan')).ok).toBe(true);
    expect((await moreChats(client)).ok).toBe(true);
    expect(desktop.delivered.slice(-2)).toEqual([
      { action: 'type', text: 'plan' },
      { action: 'scroll', target: 'c1', lines: -6 },
    ]);
  });

  it('brings up Sovra’s chat only when another page is showing', async () => {
    const desktop = new FakeDesktop();
    desktop.element('nav-chat', 'Chat', 'Button', 120);
    desktop.onDeliver = (input) => {
      if (input.action === 'click' && input.target === 'nav-chat') desktop.element('composer', 'Message Sovra', 'MultilineTextInput', 700);
    };
    const client = pairedClient(desktop);
    expect((await openChatPage(client)).ok).toBe(true);
    expect((await openChatPage(client)).ok).toBe(true);
    expect(desktop.delivered).toEqual([{ action: 'click', target: 'nav-chat' }]);
  });
});
