import { create } from 'zustand';

import type { Appearance } from '@/theme';

import { loadPreferences, savePreferences } from './storage';

export interface Preferences {
  appearance: Appearance;
  /** Mirror refresh cadence while the remote screen is open (ms). Must stay under 5 s. */
  refreshMs: number;
  /** Testing on one Wi-Fi only: no relays or Internet address lookup. */
  localOnly: boolean;
  /** Fetch a screenshot of the Sovra window with each refresh, when the desktop supports it. */
  screenshots: boolean;
}

const defaults: Preferences = { appearance: 'system', refreshMs: 2000, localOnly: false, screenshots: false };

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
    const { appearance, refreshMs, localOnly, screenshots } = { ...get(), ...patch };
    void savePreferences<Preferences>({ appearance, refreshMs, localOnly, screenshots });
  },
}));
