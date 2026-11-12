/**
 * Presentation helpers over Inspect snapshots. Roles are AccessKit `Role` names as
 * the desktop prints them (`format!("{role:?}")`), e.g. `Button`, `TextInput`.
 */
import type { InspectResult, UiElement } from './wire';

const TEXT_ROLES = new Set(['TextInput', 'MultilineTextInput', 'SearchInput', 'EmailInput', 'NumberInput', 'PasswordInput', 'ComboBox']);
const ACTION_ROLES = new Set([
  'Button',
  'DefaultButton',
  'Link',
  'CheckBox',
  'Switch',
  'RadioButton',
  'Tab',
  'MenuItem',
  'MenuItemCheckBox',
  'MenuItemRadio',
  'ListItem',
  'ListBoxOption',
  'TreeItem',
  'DisclosureTriangle',
  'ToggleButton',
  'PopupButton',
  'Slider',
  'ComboBox',
]);
const SCROLL_ROLES = new Set(['ScrollView', 'List', 'ListBox', 'Tree', 'Grid', 'Table', 'Log', 'Feed', 'Document']);

export type ElementKind = 'text' | 'action' | 'scroll' | 'content';

export function kindOf(element: UiElement): ElementKind {
  const role = element.role ?? '';
  if (TEXT_ROLES.has(role)) return 'text';
  if (ACTION_ROLES.has(role)) return 'action';
  if (SCROLL_ROLES.has(role)) return 'scroll';
  return 'content';
}

export function isInteractive(element: UiElement): boolean {
  const kind = kindOf(element);
  return element.visible && kind !== 'content';
}

/** A readable name; elements with no label fall back to their role. */
export function describe(element: UiElement): string {
  const label = element.label?.trim();
  if (label) return label;
  return humanRole(element.role) ?? 'Unnamed control';
}

export function humanRole(role: string | null): string | null {
  if (!role) return null;
  return role.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/** Visible, labelled controls in reading order (top-to-bottom, then left-to-right). */
export function actionableControls(snapshot: InspectResult): UiElement[] {
  return snapshot.elements
    .filter((element) => isInteractive(element) && (element.label?.trim() || kindOf(element) === 'text'))
    .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
}

/** Visible text that is not itself a control, for reading replies on the phone. */
export function readableText(snapshot: InspectResult): UiElement[] {
  return snapshot.elements
    .filter((element) => element.visible && kindOf(element) === 'content' && element.label?.trim())
    .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
}

const COMPOSER_HINT = /(message|ask|chat|prompt|type|reply)/i;

/**
 * The chat box: the visible text input whose label reads like a composer, or else
 * the lowest text input in the window (Sovra docks the composer at the bottom).
 */
export function findComposer(snapshot: InspectResult): UiElement | null {
  const inputs = snapshot.elements.filter(
    (element) => element.visible && element.disabled !== true && kindOf(element) === 'text',
  );
  if (inputs.length === 0) return null;
  const hinted = inputs.filter((element) => element.label && COMPOSER_HINT.test(element.label));
  const pool = hinted.length > 0 ? hinted : inputs;
  return pool.reduce((lowest, element) => (element.bounds.y > lowest.bounds.y ? element : lowest));
}

const STOP_HINT = /^(stop|stop (generating|response|this|working|run))/i;

/** The real "stop" control of ongoing work, if one is visible. */
export function findStop(snapshot: InspectResult): UiElement | null {
  return (
    snapshot.elements.find(
      (element) =>
        element.visible &&
        element.disabled !== true &&
        kindOf(element) === 'action' &&
        element.label !== null &&
        STOP_HINT.test(element.label.trim()),
    ) ?? null
  );
}

/** Bounding box of the whole window, used to scale the mirror view. */
export function windowSize(snapshot: InspectResult): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const element of snapshot.elements) {
    if (!element.visible) continue;
    width = Math.max(width, element.bounds.x + element.bounds.width);
    height = Math.max(height, element.bounds.y + element.bounds.height);
  }
  return { width: Math.max(width, 1), height: Math.max(height, 1) };
}
