import { FakeDesktop } from '@/remote/__tests__/fake-desktop';

import { useRemote } from '../remote';

jest.mock('../storage', () => ({
  loadDesktop: async () => ({ address: { device: '01'.repeat(32), relay: null, addrs: ['127.0.0.1:1'] }, name: 'Mac', pairedAt: '2026-11-13T00:00:00Z' }),
  saveDesktop: async () => undefined,
  deleteDesktop: async () => undefined,
  loadPreferences: async () => ({}),
  savePreferences: async () => undefined,
}));

/** Let the store's queued refresh finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('connection progress', () => {
  let desktop: FakeDesktop;

  beforeEach(async () => {
    jest.useRealTimers();
    desktop = new FakeDesktop();
    desktop.paired.add('ab'.repeat(32));
    desktop.element('send', 'Message Sovra', 'MultilineTextInput');
    await useRemote.getState().init(async () => desktop.transport());
  });

  afterEach(() => useRemote.getState().stopLive());

  it('counts failed tries, schedules the next one, then reports the route once connected', async () => {
    desktop.unreachable = true;
    useRemote.getState().startLive();
    await settle();
    let state = useRemote.getState();
    expect(state.phase).toBe('unreachable');
    expect(state.progress).toMatchObject({ step: 'waiting', attempt: 1 });
    expect(state.progress?.retryAt).toBeGreaterThan(Date.now());

    desktop.unreachable = false;
    desktop.route = 'relay';
    useRemote.getState().retryNow();
    // The failed endpoint was dropped, so the next try starts by binding a fresh one.
    expect(useRemote.getState().progress).toMatchObject({ step: 'starting', attempt: 2, retryAt: null });
    await settle();
    await settle();
    state = useRemote.getState();
    expect(state.phase).toBe('connected');
    expect(state.progress).toBeNull();
    expect(state.route).toBe('relay');
  });

  it('binds a fresh endpoint after a network failure', async () => {
    const factory = jest.fn(async () => desktop.transport());
    await useRemote.getState().init(factory);
    desktop.unreachable = true;
    useRemote.getState().startLive();
    await settle();
    expect(factory).toHaveBeenCalledTimes(1);
    desktop.unreachable = false;
    useRemote.getState().retryNow();
    await settle();
    await settle();
    expect(useRemote.getState().phase).toBe('connected');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('does not start a second try while one is running', async () => {
    useRemote.getState().startLive();
    useRemote.getState().retryNow();
    await settle();
    await settle();
    expect(useRemote.getState().phase).toBe('connected');
    expect(desktop.connections).toHaveLength(1);
  });
});
