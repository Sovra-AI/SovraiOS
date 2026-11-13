import { reachFrom } from '../preferences';

describe('reachFrom', () => {
  it('uses every path unless a testing option narrows it', () => {
    expect(reachFrom({ localOnly: false, relayOnly: false })).toBe('internet');
    expect(reachFrom({ localOnly: false, relayOnly: true })).toBe('relay');
    expect(reachFrom({ localOnly: true, relayOnly: false })).toBe('local');
    // Same Wi-Fi only wins if old saved settings somehow have both.
    expect(reachFrom({ localOnly: true, relayOnly: true })).toBe('local');
  });
});
