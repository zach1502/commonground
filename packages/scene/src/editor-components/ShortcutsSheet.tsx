import { useEffect, useId, useRef } from 'react';
import type { ReactElement } from 'react';

import { SHORTCUTS } from '../editor/keyboard.js';
import { RISE_FROM_BELOW } from '../motion/panel-motion.js';
import { usePresence } from '../motion/use-presence.js';

import type { EditorStrings } from './strings.js';
import { buttonStyle, floatingStyle, headingStyle, keyStyle, rowStyle } from './styles.js';

export interface ShortcutsSheetProps {
  readonly state: 'open' | 'closed';
  readonly strings: EditorStrings;
  readonly onClose: () => void;
}

const sheetStyle = {
  ...floatingStyle,
  flexDirection: 'column',
  whiteSpace: 'normal',
  padding: 'var(--layout-padding-medium)',
  maxBlockSize: '80vh',
  overflowY: 'auto',
} as const;
const cellStyle = { textAlign: 'start', padding: 'var(--layout-padding-xsmall)' } as const;

const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside the sheet and moves focus back to the opener when it closes. */
function useDialogFocus(dialog: { current: HTMLDivElement | null }): void {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = dialog.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog.current)?.focus();
    return () => {
      opener?.focus();
    };
  }, [dialog]);
}

function trapTab(dialog: HTMLDivElement, event: React.KeyboardEvent): void {
  const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first?.focus();
  }
}

/** The open sheet: a modal dialog that traps Tab, closes on Esc and returns focus on close. */
type DialogProps = Omit<ShortcutsSheetProps, 'state'> & {
  readonly onElement: (element: HTMLDivElement | null) => void;
  readonly leaving: { readonly 'aria-hidden'?: 'true' };
};

function ShortcutsDialog({ strings, onClose, onElement, leaving }: DialogProps): ReactElement {
  const id = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const text = strings.shortcuts;
  useDialogFocus(dialog);
  return (
    <div
      ref={(element) => {
        dialog.current = element;
        onElement(element);
      }}
      role="dialog"
      {...leaving}
      aria-modal="true"
      aria-labelledby={id}
      tabIndex={-1}
      style={sheetStyle}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        } else if (event.key === 'Tab' && dialog.current !== null) {
          trapTab(dialog.current, event);
        }
      }}
    >
      <div style={{ ...rowStyle, justifyContent: 'space-between' }}>
        <h2 id={id} style={headingStyle}>
          {text.heading}
        </h2>
        <button type="button" style={buttonStyle} onClick={onClose}>
          {text.close}
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col" style={cellStyle}>
              {text.keyColumn}
            </th>
            <th scope="col" style={cellStyle}>
              {text.actionColumn}
            </th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map(({ action }) => (
            <tr key={action}>
              <td style={cellStyle}>
                <kbd style={keyStyle}>{text.rows[action].keys}</kbd>
              </td>
              <td style={cellStyle}>{text.rows[action].action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Every shortcut, opened with ? or the Shortcuts button. Esc closes it and returns focus. It rises
 * 8 px from its bottom edge as it opens and sinks back as it closes.
 */
export function ShortcutsSheet({
  state,
  strings,
  onClose,
}: ShortcutsSheetProps): ReactElement | null {
  const presence = usePresence<HTMLDivElement>(
    state === 'open' ? 'shown' : 'hidden',
    RISE_FROM_BELOW,
  );
  if (presence.mounted === 'unmounted') return null;
  return (
    <ShortcutsDialog
      strings={strings}
      onClose={onClose}
      onElement={presence.ref}
      leaving={presence.leaving}
    />
  );
}
