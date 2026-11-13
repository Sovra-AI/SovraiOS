import { planTyping, sendChatMessage, stopWork, typeInto } from '../chat';
import { RemoteClient, sanitizePhoneName } from '../client';
import { decodeTicket } from '../ticket';
import { FakeDesktop, SECRET, desktopAddress } from './fake-desktop';

const ticket = decodeTicket(
  `sovra://remote-control?ticket=${encodeURIComponent(
    JSON.stringify({ version: 1, address: desktopAddress, secret: SECRET }),
  )}`,
)!;

function pairedClient(desktop: FakeDesktop) {
  desktop.paired.add('ab'.repeat(32));
  return new RemoteClient(desktop.transport(), desktopAddress);
}

describe('RemoteClient', () => {
  it('pairs once, then reconnects with Hello without a new invitation', async () => {
    const desktop = new FakeDesktop();
    const client = new RemoteClient(desktop.transport(), null);
    expect((await client.inspect()).ok).toBe(false);
    const paired = await client.pair(ticket, 'Pixel');
    expect(paired).toEqual({ ok: true, value: desktopAddress });
    expect(desktop.invitation).toBeNull();
    // Re-scanning the same (now consumed) QR still succeeds via Hello.
    expect((await client.pair(ticket, 'Pixel')).ok).toBe(true);

    const restarted = new RemoteClient(desktop.transport(), desktopAddress);
    const view = await restarted.inspect();
    expect(view.ok).toBe(true);
    const ops = desktop.requests.map((r) => r.operation.op);
    expect(ops.slice(-2)).toEqual(['hello', 'control']);
  });

  it('uses up a fresh code when an already-paired phone scans it again', async () => {
    const desktop = new FakeDesktop();
    desktop.paired.add('ab'.repeat(32));
    const client = new RemoteClient(desktop.transport(), null);
    expect((await client.pair(ticket, 'Pixel')).ok).toBe(true);
    expect(desktop.requests.map((r) => r.operation.op)).toEqual(['hello', 'pair']);
    expect(desktop.invitation).toBeNull();
  });

  it('stays paired when the code is already used or refused after Hello', async () => {
    const desktop = new FakeDesktop();
    desktop.paired.add('ab'.repeat(32));
    desktop.invitation = null;
    const client = new RemoteClient(desktop.transport(), null);
    expect(await client.pair(ticket, 'Pixel')).toEqual({ ok: true, value: desktopAddress });
  });

  it('reports a wrong invitation and never treats unreachable as revoked', async () => {
    const desktop = new FakeDesktop();
    desktop.invitation = 'ff'.repeat(32);
    const client = new RemoteClient(desktop.transport(), null);
    const result = await client.pair(ticket, 'Pixel');
    expect(result).toMatchObject({ ok: false, code: 'invalid_invitation' });

    const paired = pairedClient(new FakeDesktop());
    const offline = new FakeDesktop();
    offline.unreachable = true;
    const unreachable = new RemoteClient(offline.transport(), desktopAddress);
    expect(await unreachable.inspect()).toMatchObject({ ok: false, code: 'unreachable' });
    expect(unreachable.paired).toBe(true);
    expect(paired.paired).toBe(true);
  });

  it('uses exact sequences starting at 1 and inspects before every mutation', async () => {
    const desktop = new FakeDesktop();
    const send = desktop.element('send', 'Send', 'Button');
    const client = pairedClient(desktop);
    expect((await client.act({ kind: 'click', element: send })).ok).toBe(true);
    expect((await client.act({ kind: 'key', key: 'enter' })).ok).toBe(true);
    const controls = desktop.requests.filter((r) => r.operation.op === 'control').map((r) => r.operation);
    expect(controls.map((op) => (op as { sequence: number }).sequence)).toEqual([1, 2, 3, 4]);
    expect(controls.map((op) => (op as { request: { action: string } }).request.action)).toEqual([
      'inspect',
      'click',
      'inspect',
      'key',
    ]);
    expect(desktop.delivered).toEqual([{ action: 'click', target: 'send' }, { action: 'key', key: 'enter' }]);
  });

  it('retries only stale observations, which the desktop never delivers', async () => {
    const desktop = new FakeDesktop();
    const send = desktop.element('send', 'Send', 'Button');
    const client = pairedClient(desktop);
    desktop.churn = 2;
    expect((await client.act({ kind: 'click', element: send })).ok).toBe(true);
    expect(desktop.delivered).toHaveLength(1);

    desktop.churn = 10;
    expect(await client.act({ kind: 'click', element: send })).toMatchObject({ ok: false, code: 'stale_observation' });
    expect(desktop.delivered).toHaveLength(1);
  });

  it('never replays a mutation whose reply was lost', async () => {
    const desktop = new FakeDesktop();
    const client = pairedClient(desktop);
    expect((await client.inspect()).ok).toBe(true);
    // The key is delivered, then its reply is lost.
    const before = desktop.requests.length;
    desktop.dropReplyFor = 'key';
    const result = await client.act({ kind: 'key', key: 'enter' });
    expect(result).toMatchObject({ ok: false, code: 'outcome_unknown' });
    expect(desktop.delivered).toEqual([{ action: 'key', key: 'enter' }]);
    expect(desktop.requests.length - before).toBe(2);
    // The next mutation starts from a fresh Hello and inspection, not a replay.
    expect((await client.act({ kind: 'key', key: 'escape' })).ok).toBe(true);
    expect(desktop.delivered.map((d) => d.key)).toEqual(['enter', 'escape']);
  });

  it('reconnects reads after the desktop closes an idle connection', async () => {
    const desktop = new FakeDesktop();
    const client = pairedClient(desktop);
    expect((await client.inspect()).ok).toBe(true);
    desktop.connections.forEach((connection) => connection.close());
    expect((await client.inspect()).ok).toBe(true);
    expect(desktop.requests.filter((r) => r.operation.op === 'hello')).toHaveLength(2);
  });

  it('re-finds a control by label after reconnecting changes target IDs', async () => {
    const desktop = new FakeDesktop();
    desktop.element('old', 'Settings', 'Button');
    const client = pairedClient(desktop);
    const view = await client.inspect();
    const settings = view.ok ? view.value.elements[0] : null;
    desktop.elements = [];
    desktop.element('new', 'Settings', 'Button');
    expect((await client.act({ kind: 'click', element: settings! })).ok).toBe(true);
    expect(desktop.delivered).toEqual([{ action: 'click', target: 'new' }]);

    desktop.elements = [];
    expect(await client.act({ kind: 'click', element: settings! })).toMatchObject({ ok: false, code: 'stale_observation' });
  });

  it('stops on disabled desktops and asks for a fresh look', async () => {
    const desktop = new FakeDesktop();
    const client = pairedClient(desktop);
    desktop.enabled = false;
    expect(await client.inspect()).toMatchObject({ ok: false, code: 'disabled' });
  });
});

describe('chat helpers', () => {
  it('types through the real composer, then presses Enter', async () => {
    const desktop = new FakeDesktop();
    desktop.element('nav', 'Settings', 'Button', 0);
    desktop.element('composer', 'Ask Sovra anything', 'MultilineTextInput', 500);
    const client = pairedClient(desktop);
    const result = await sendChatMessage(client, 'Hello there\nsecond line');
    expect(result.ok).toBe(true);
    expect(desktop.delivered).toEqual([
      { action: 'click', target: 'composer' },
      { action: 'key', key: 'secondary-a' },
      { action: 'key', key: 'backspace' },
      { action: 'type', text: 'Hello there' },
      { action: 'key', key: 'shift-enter' },
      { action: 'type', text: 'second line' },
      { action: 'key', key: 'enter' },
    ]);
  });

  it('runs a bare /skill instead of only completing its name', async () => {
    const desktop = new FakeDesktop();
    desktop.element('composer', 'Message Sovra', 'MultilineTextInput', 500);
    expect((await sendChatMessage(pairedClient(desktop), '/new')).ok).toBe(true);
    expect(desktop.delivered.slice(-2)).toEqual([
      { action: 'type', text: '/new ' },
      { action: 'key', key: 'enter' },
    ]);
  });

  it('types a /skill with words after it unchanged', async () => {
    const desktop = new FakeDesktop();
    desktop.element('composer', 'Message Sovra', 'MultilineTextInput', 500);
    expect((await sendChatMessage(pairedClient(desktop), '/table three plants')).ok).toBe(true);
    expect(desktop.delivered).toContainEqual({ action: 'type', text: '/table three plants' });
  });

  it('types into a chosen field on the computer without pressing Enter', async () => {
    const desktop = new FakeDesktop();
    const field = desktop.element('task', 'Task name', 'TextInput', 372);
    const client = pairedClient(desktop);
    expect((await typeInto(client, field, 'Morning briefing')).ok).toBe(true);
    expect(desktop.delivered).toEqual([
      { action: 'click', target: 'task' },
      { action: 'type', text: 'Morning briefing' },
    ]);
  });

  it('never mistakes a form field for the chat box', async () => {
    const desktop = new FakeDesktop();
    desktop.element('group-name', '1. What should the group be called?', 'TextInput', 336);
    desktop.element('device', '3. What do you call this computer?', 'TextInput', 520);
    desktop.element('nav-chat', 'Chat', 'Button', 120);
    desktop.onDeliver = (input) => {
      if (input.action === 'click' && input.target === 'nav-chat') desktop.element('composer', 'Message Sovra', 'MultilineTextInput', 700);
    };
    expect((await sendChatMessage(pairedClient(desktop), 'hi')).ok).toBe(true);
    expect(desktop.delivered[0]).toEqual({ action: 'click', target: 'nav-chat' });
    expect(desktop.delivered[1]).toEqual({ action: 'click', target: 'composer' });
  });

  it('never types into a search box', async () => {
    const desktop = new FakeDesktop();
    desktop.element('search', 'Search chats', 'TextInput', 500);
    const client = pairedClient(desktop);
    const result = await sendChatMessage(client, 'hi');
    expect(result.ok).toBe(false);
    expect(desktop.delivered).toEqual([]);
  });

  it('prefers Sovra’s composer over other text inputs', async () => {
    const desktop = new FakeDesktop();
    desktop.element('search', 'Search chats', 'TextInput', 800);
    desktop.element('composer', 'Message Sovra', 'MultilineTextInput', 700);
    const client = pairedClient(desktop);
    expect((await sendChatMessage(client, 'hi')).ok).toBe(true);
    expect(desktop.delivered[0]).toEqual({ action: 'click', target: 'composer' });
  });

  it('opens Chat on the computer when no chat box is showing', async () => {
    const desktop = new FakeDesktop();
    desktop.element('search', 'Search chats', 'TextInput', 500);
    desktop.element('nav-chat', 'Chat', 'Button', 120);
    desktop.onDeliver = (input) => {
      if (input.action === 'click' && input.target === 'nav-chat') desktop.element('composer', 'Message Sovra', 'MultilineTextInput', 700);
    };
    const client = pairedClient(desktop);
    const result = await sendChatMessage(client, 'hi');
    expect(result.ok).toBe(true);
    expect(desktop.delivered).toEqual([
      { action: 'click', target: 'nav-chat' },
      { action: 'click', target: 'composer' },
      { action: 'key', key: 'secondary-a' },
      { action: 'key', key: 'backspace' },
      { action: 'type', text: 'hi' },
      { action: 'key', key: 'enter' },
    ]);
  });

  it('stops after opening Chat if there is still no chat box', async () => {
    const desktop = new FakeDesktop();
    desktop.element('nav-chat', 'Chat', 'Button', 120);
    const client = pairedClient(desktop);
    const result = await sendChatMessage(client, 'hi');
    expect(result).toMatchObject({ ok: false, failure: { stage: 'focus', partial: false } });
    expect(desktop.delivered).toEqual([{ action: 'click', target: 'nav-chat' }]);
  });

  it('explains a missing chat box instead of typing blindly', async () => {
    const desktop = new FakeDesktop();
    const client = pairedClient(desktop);
    const result = await sendChatMessage(client, 'hi');
    expect(result.ok).toBe(false);
    expect(desktop.delivered).toEqual([]);
  });

  it('presses the visible Stop control, or Escape', async () => {
    const desktop = new FakeDesktop();
    const client = pairedClient(desktop);
    expect((await stopWork(client)).ok).toBe(true);
    desktop.element('stop', 'Stop', 'Button');
    expect((await stopWork(client)).ok).toBe(true);
    expect(desktop.delivered).toEqual([{ action: 'key', key: 'escape' }, { action: 'click', target: 'stop' }]);
  });

  it('never mistakes other “Stop …” buttons for stopping work', async () => {
    const desktop = new FakeDesktop();
    desktop.element('phone-off', 'Stop phone control', 'Button');
    desktop.element('unshare', 'Stop sharing', 'Button');
    const client = pairedClient(desktop);
    expect((await stopWork(client)).ok).toBe(true);
    desktop.element('stop', 'Stop generating', 'Button');
    expect((await stopWork(client)).ok).toBe(true);
    expect(desktop.delivered).toEqual([{ action: 'key', key: 'escape' }, { action: 'click', target: 'stop' }]);
  });

  it('splits long text within the 4 KiB limit', () => {
    const steps = planTyping('é'.repeat(3000));
    expect(steps).toHaveLength(2);
    expect(steps.every((step) => step.kind === 'type' && new TextEncoder().encode(step.text).length <= 4096)).toBe(true);
  });

  it('cleans phone names for the desktop', () => {
    expect(sanitizePhoneName('  Pixel\u0007 9  ')).toBe('Pixel 9');
    expect(new TextEncoder().encode(sanitizePhoneName('é'.repeat(100))).length).toBeLessThanOrEqual(80);
    expect(sanitizePhoneName('\u0001')).toBe('My phone');
  });
});
