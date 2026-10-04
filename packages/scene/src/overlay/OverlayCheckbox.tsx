import type { ReactElement } from 'react';

import { buttonStyle } from './styles.js';

export interface OverlayCheckboxProps {
  readonly label: string;
  readonly checked: 'on' | 'off';
  readonly onChange: (checked: 'on' | 'off') => void;
}

const chipStyle = { ...buttonStyle, gap: 'var(--layout-margin-xsmall)' } as const;
const boxStyle = { margin: 0 } as const;

/** A checkbox drawn as one of the view's toolbar buttons, for a page control over the 3D view. */
export function OverlayCheckbox({ label, checked, onChange }: OverlayCheckboxProps): ReactElement {
  return (
    <label style={chipStyle}>
      <input
        type="checkbox"
        style={boxStyle}
        checked={checked === 'on'}
        onChange={(event) => {
          onChange(event.target.checked ? 'on' : 'off');
        }}
      />
      {label}
    </label>
  );
}
