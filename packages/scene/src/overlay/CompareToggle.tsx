import type { ReactElement } from 'react';

import { buttonStyle, pressedButtonStyle } from './styles.js';

export type CompareShowing = 'design' | 'today';

export interface CompareToggleProps {
  readonly label: string;
  readonly showing: CompareShowing;
  readonly onChange: (showing: CompareShowing) => void;
}

/** Switches between the design and the site as it is now. */
export function CompareToggle({ label, showing, onChange }: CompareToggleProps): ReactElement {
  const pressed = showing === 'today';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      style={pressed ? pressedButtonStyle : buttonStyle}
      onClick={() => {
        onChange(pressed ? 'design' : 'today');
      }}
    >
      {label}
    </button>
  );
}
