import { create } from 'zustand';

import type { Appearance } from '@/theme';

import { loadPreferences, savePreferences } from './storage';

export interface Preferences {
  appearance: Appearance;
  /** Mirror refresh cadence while the remote screen is open (ms). Must stay under 5 s. */
  refreshMs: number;
  /** Testing on one Wi-Fi only: no relays or Internet address lookup. */
  localOnly: boolean;
  /** Testing the off-network path: no direct sockets, everything through the encrypted relay. */
  relayOnly: boolean;
  /** Show connection details (attempt log, relay and DNS checks) on the remote screen. */
  developer: boolean;
  /** Fetch a screenshot of the Sovra window with each refresh, when the desktop supports it. */
  screenshots: boolean;
}

const defaults: Preferences = { appearance: 'system', refreshMs: 2000, localOnly: false, relayOnly: false, developer: false, screenshots: false };

/** How the phone may reach the computer. */
export type Reach = 'internet' | 'local' | 'relay';

export function reachFrom({ localOnly, relayOnly }: Pick<Preferences, 'localOnly' | 'relayOnly'>): Reach {
  if (localOnly) return 'local';
  return relayOnly ? 'relay' : 'internet';
}

interface PreferencesStore extends Preferences {
  loaded: boolean;
  load(): Promise<void>;
  set(patch: Partial<Preferences>): void;
}

export const usePreferences = create<PreferencesStore>((set, get) => ({
  ...defaults,
  loaded: false,
  async load() {
    const saved = await loadPreferences<Preferences>();
    set({ ...defaults, ...saved, loaded: true });
  },
  set(patch) {
    set(patch);
    const { appearance, refreshMs, localOnly, relayOnly, developer, screenshots } = { ...get(), ...patch };
    void savePreferences<Preferences>({ appearance, refreshMs, localOnly, relayOnly, developer, screenshots });
  },
}));
