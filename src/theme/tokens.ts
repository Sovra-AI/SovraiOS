/**
 * Sovra design tokens, ported from the Sovra Harness native design system:
 * `SovraHarness/crates/sovra-ui/src/design/palette.rs` and `tokens.rs`
 * (themselves imported from SovraSRXProduction). Raw colours live only here.
 *
 * Mobile adaptations (see docs/theming.md): touch targets are 44pt instead of the
 * desktop's 36px, body text is 16 instead of 14, everything else is unchanged.
 */

/** Brand accents shared by both themes (`palette.rs` constants). */
export const brand = {
  violet: '#7c3aed',
  violetDeep: '#6d28d9',
  violetLight: '#9f67ff',
  lilac: '#b98cf0',
  lilacLight: '#d7c2f7',
  indigo: '#5b6cf0',
  /** Slightly deeper than brand indigo so white labels pass 4.5:1. */
  indigoFill: '#5566e6',
  white: '#ffffff',
  black: '#000000',
} as const;

export interface Palette {
  canvas: string;
  surface: string;
  hover: string;
  text: string;
  secondaryText: string;
  mutedText: string;
  link: string;
  border: string;
  controlBorder: string;
  danger: string;
  success: string;
  warning: string;
  statusInk: string;
  ring: string;
  primary: string;
  primaryPressed: string;
  primaryForeground: string;
  /** 102° violet → indigo, the desktop's `button_primary`. */
  primaryGradient: string;
  primaryGradientPressed: string;
  selection: string;
  overlay: string;
  composerBackground: string;
  composerBorder: string;
  composerFocusBorder: string;
  sendReadyBackground: string;
  sendReadyForeground: string;
  stopBackground: string;
  userBubble: string;
  codeBackground: string;
}

const gradient = (from: string) => `linear-gradient(102deg, ${from}, ${brand.indigoFill})`;

export const palettes: Record<'dark' | 'light', Palette> = {
  dark: {
    canvas: '#111216',
    surface: '#1b1c22',
    hover: '#262730',
    text: '#eff0f5',
    secondaryText: '#b5b6c3',
    mutedText: '#a0a2b2',
    link: brand.lilac,
    border: 'rgba(255, 255, 255, 0.12)',
    controlBorder: '#7d7f91',
    danger: '#ef4444',
    success: '#22c55e',
    warning: '#f59e0b',
    statusInk: brand.black,
    ring: brand.violetLight,
    primary: brand.violet,
    primaryPressed: brand.violetDeep,
    primaryForeground: brand.white,
    primaryGradient: gradient(brand.violet),
    primaryGradientPressed: gradient(brand.violetDeep),
    selection: 'rgba(124, 58, 237, 0.24)',
    overlay: 'rgba(0, 0, 0, 0.6)',
    composerBackground: '#1b1c22',
    composerBorder: 'rgba(255, 255, 255, 0.12)',
    composerFocusBorder: 'rgba(124, 58, 237, 0.6)',
    sendReadyBackground: brand.white,
    sendReadyForeground: '#0a0a0f',
    stopBackground: '#dc2626',
    userBubble: '#262730',
    codeBackground: '#0b0c0f',
  },
  light: {
    canvas: '#fcfcfe',
    surface: brand.white,
    hover: '#efeff5',
    text: '#22232c',
    secondaryText: '#595b6b',
    mutedText: '#666878',
    link: brand.violetDeep,
    border: 'rgba(124, 58, 237, 0.1)',
    controlBorder: '#868798',
    danger: '#dc2626',
    success: '#15803d',
    warning: '#b45309',
    statusInk: brand.white,
    ring: brand.violetDeep,
    primary: brand.violet,
    primaryPressed: brand.violetDeep,
    primaryForeground: brand.white,
    primaryGradient: gradient(brand.violet),
    primaryGradientPressed: gradient(brand.violetDeep),
    selection: 'rgba(124, 58, 237, 0.10)',
    overlay: 'rgba(0, 0, 0, 0.6)',
    composerBackground: brand.white,
    composerBorder: 'rgba(76, 29, 149, 0.16)',
    composerFocusBorder: 'rgba(124, 58, 237, 0.6)',
    sendReadyBackground: '#0a0a0f',
    sendReadyForeground: brand.white,
    stopBackground: '#dc2626',
    userBubble: '#efeff5',
    codeBackground: '#f4f4f8',
  },
};

/** 2/4/6/8/16/24/32/48 — the desktop `SpaceTokens`, in points. */
export const space = {
  hair: 2,
  compact: 4,
  snug: 6,
  small: 8,
  medium: 16,
  large: 24,
  extra: 32,
  section: 48,
} as const;

/** 6/10/10/14/18 — the desktop `RadiusTokens`. */
export const radius = {
  small: 6,
  button: 10,
  input: 10,
  card: 14,
  panel: 18,
  pill: 999,
} as const;

export const layout = {
  hairline: 1,
  /** Apple HIG / Material minimum touch target (desktop uses 36px). */
  control: 44,
  compactControl: 36,
  readingWidth: 640,
  scanCode: 260,
  logoSmall: 28,
  logoHero: 72,
} as const;

/** Desktop roles: 36 welcome, 28 page title, 16 section title, body, 12 caption. */
export const type = {
  display: { fontSize: 36, lineHeight: 42, fontWeight: '700' },
  pageTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

/** Named durations (ms), zeroed when the OS asks for reduced motion. */
export const motion = { enter: 240, exit: 160, press: 100, control: 180, material: 220 } as const;
