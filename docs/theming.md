# Theming

`src/theme/tokens.ts` is a port of the Sovra Harness native design system, so the phone
and desktop look like one product:

| Desktop source | Phone |
| --- | --- |
| `crates/sovra-ui/src/design/palette.rs` (`palette()`, `config()`) | `palettes.dark` / `palettes.light` |
| `palette.rs` brand constants (violet, indigo, lilac…) | `brand` |
| `tokens.rs` `SpaceTokens` 2/4/6/8/16/24/32/48 | `space` |
| `tokens.rs` `RadiusTokens` 6/10/10/14/18/pill | `radius` |
| `tokens.rs` `ChatTokens` (composer, send, stop, user bubble) | `composer*`, `send*`, `stopBackground`, `userBubble` |
| `button_primary` 102° violet → `#5566e6` gradient | `primaryGradient` (native CSS `backgroundImage`) |
| Text roles 36/28/16/14/12 | `type.display/pageTitle/sectionTitle/body/caption` |
| `crates/sovra-ui/assets/branding/sovra-logo.svg` | `assets/images/sovra-logo.svg` (byte-identical, rendered with `expo-image`) |

## Mobile adaptations

| Desktop | Phone | Why |
| --- | --- | --- |
| 36px controls | 44pt controls (`layout.control`) | Apple HIG / Material minimum touch target |
| 14px UI body | 16pt body, 13pt caption | Readability at arm's length; iOS default body size |
| Dark first, Settings → Appearance | **System** by default; Settings offers Dark / Light | Phones follow the OS setting by convention |
| Hover states | Pressed states | No hover on touch screens |

App icons are rendered from the same SVG (silhouette + its own radial gradient
`#A855F7 → #7E22CE`) on the dark canvas `#111216`.

## Rules

- Raw colours live only in `src/theme/tokens.ts`. Components read `useTheme()`.
- Use `Text` roles (`variant="pageTitle"` …) and `Button` variants from `src/components/ui.tsx`
  instead of local styles.
- Keep both themes readable: text uses `text` / `secondaryText` / `mutedText`, accents use
  `link` (contrast-tested on the desktop), fills use `primary`.
- When the desktop palette changes, update `tokens.ts` (and SovraAndroid's `ui/Theme.kt`) to
  match, and note the desktop commit in the commit message.
