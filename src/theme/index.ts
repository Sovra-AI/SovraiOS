import { useColorScheme } from 'react-native';

import { usePreferences } from '@/state/preferences';

import { type Palette, layout, motion, palettes, radius, space, type } from './tokens';

export type Appearance = 'system' | 'dark' | 'light';

export interface Theme {
  dark: boolean;
  colors: Palette;
  space: typeof space;
  radius: typeof radius;
  layout: typeof layout;
  type: typeof type;
  motion: typeof motion;
}

export function themeFor(dark: boolean): Theme {
  return { dark, colors: palettes[dark ? 'dark' : 'light'], space, radius, layout, type, motion };
}

/** Dark is Sovra's initial mode (matching the desktop); users can follow the system. */
export function useTheme(): Theme {
  const system = useColorScheme();
  const appearance = usePreferences((state) => state.appearance);
  const dark = appearance === 'system' ? system !== 'light' : appearance === 'dark';
  return themeFor(dark);
}

export { brand, palettes } from './tokens';
