import type { ConnectionProgress } from '@/state/remote';

import { describeConnection, pairingStatus, routeLabel, showConnectionCard } from '../connection-status';

const at = (patch: Partial<ConnectionProgress>): ConnectionProgress => ({ step: 'reaching', attempt: 1, since: 0, retryAt: null, ...patch });

describe('describeConnection', () => {
  it('shows each step as it happens', () => {
    const starting = describeConnection(at({ step: 'starting' }), 'Mac', 0, null);
    expect(starting.title).toBe('Connecting to Mac…');
    expect(starting.steps.map((step) => step.state)).toEqual(['active', 'todo']);

    const reaching = describeConnection(at({}), 'Mac', 3000, null);
    expect(reaching.steps.map((step) => step.state)).toEqual(['done', 'active']);
    expect(reaching.status).toBe('Trying for 3 s');
    expect(reaching.hint).toBeNull();
    expect(reaching.canRetryNow).toBe(false);
  });

  it('explains slow first tries without blaming the person', () => {
    expect(describeConnection(at({}), 'Mac', 7000, null).hint).toMatch(/mobile data/);
  });

  it('counts down to the next try and offers to try now', () => {
    const view = describeConnection(at({ step: 'waiting', attempt: 2, retryAt: 14_500 }), 'Mac', 10_000, 'Your computer took too long to answer.');
    expect(view.title).toBe('Can’t reach Mac yet');
    expect(view.status).toBe('Trying again in 5 s · attempt 2');
    expect(view.steps[1]).toMatchObject({ label: 'Mac didn’t answer', detail: 'Your computer took too long to answer.' });
    expect(view.canRetryNow).toBe(true);
  });

  it('keeps the last failure in view while trying again', () => {
    expect(describeConnection(at({ attempt: 2 }), 'Mac', 1000, 'offline').steps[1].detail).toBe('Last try: offline');
  });

  it('lists what to check after repeated failures', () => {
    expect(describeConnection(at({ attempt: 3 }), 'Mac', 1000, null).hint).toMatch(/Use Sovra from your phone/);
  });
});

describe('showConnectionCard', () => {
  it('stays quiet for a quick reconnect, then explains', () => {
    expect(showConnectionCard(at({}), 1000)).toBe(false);
    expect(showConnectionCard(at({}), 1600)).toBe(true);
    expect(showConnectionCard(at({ attempt: 2 }), 0)).toBe(true);
    expect(showConnectionCard(at({ step: 'waiting' }), 0)).toBe(true);
  });
});

describe('routeLabel', () => {
  it('names the path in plain words', () => {
    expect(routeLabel('direct')).toBe('Connected directly');
    expect(routeLabel('relay')).toBe('Connected through an encrypted relay');
    expect(routeLabel(null)).toBe('Connected');
  });
});

describe('pairingStatus', () => {
  it('keeps counting and explains a slow pairing', () => {
    expect(pairingStatus(0)).toBe('Pairing securely with your computer…');
    expect(pairingStatus(2400)).toBe('Pairing securely with your computer… 2 s');
    expect(pairingStatus(9000)).toMatch(/9 s\. Over mobile data/);
  });
});
