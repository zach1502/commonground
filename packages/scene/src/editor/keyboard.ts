export type EditorAction =
  | 'delete'
  | 'undo'
  | 'redo'
  | 'duplicate'
  | 'rotateIncrease'
  | 'rotateDecrease'
  | 'shortcuts'
  | 'cancel'
  | 'finish'
  | 'backspace'
  | 'toolSelect'
  | 'toolPath'
  | 'toolArea'
  | 'toggleSnap'
  | 'itemsList';

/** Rows of the shortcuts sheet; camera is handled by the orbit controls, not by actionForKey. */
export type ShortcutRow = EditorAction | 'camera' | 'altSnap' | 'paintExit';

export interface KeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

const COMMAND_KEYS: Readonly<Record<string, EditorAction>> = {
  z: 'undo',
  y: 'redo',
  d: 'duplicate',
};

const PLAIN_KEYS: Readonly<Record<string, EditorAction>> = {
  Delete: 'delete',
  Escape: 'cancel',
  Enter: 'finish',
  Backspace: 'backspace',
  '?': 'shortcuts',
  r: 'rotateIncrease',
  R: 'rotateDecrease',
  v: 'toolSelect',
  p: 'toolPath',
  g: 'toolArea',
  n: 'toggleSnap',
  l: 'itemsList',
};

export function actionForKey(input: KeyInput): EditorAction | null {
  if (input.ctrlKey || input.metaKey) {
    const letter = input.key.toLowerCase();
    if (letter === 'z' && input.shiftKey) return 'redo';
    return COMMAND_KEYS[letter] ?? null;
  }
  return PLAIN_KEYS[input.key] ?? null;
}

/** The order of the shortcuts sheet. Key names and descriptions come from the strings prop. */
export const SHORTCUTS: readonly { readonly action: ShortcutRow }[] = [
  { action: 'toolSelect' },
  { action: 'toolPath' },
  { action: 'toolArea' },
  { action: 'itemsList' },
  { action: 'finish' },
  { action: 'backspace' },
  { action: 'cancel' },
  { action: 'paintExit' },
  { action: 'delete' },
  { action: 'duplicate' },
  { action: 'rotateIncrease' },
  { action: 'rotateDecrease' },
  { action: 'undo' },
  { action: 'redo' },
  { action: 'toggleSnap' },
  { action: 'altSnap' },
  { action: 'camera' },
  { action: 'shortcuts' },
];

const TYPING_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const ACTIVATING_TAGS = new Set(['BUTTON', 'A']);
const ACTIVATING_KEYS = new Set(['Enter', ' ']);

/** Keys typed into a field belong to the field, and Enter on a button presses the button. */
export function shouldIgnoreKey(target: { readonly tagName: string } | null, key: string): boolean {
  if (target === null) return false;
  if (TYPING_TAGS.has(target.tagName)) return true;
  return ACTIVATING_TAGS.has(target.tagName) && ACTIVATING_KEYS.has(key);
}
