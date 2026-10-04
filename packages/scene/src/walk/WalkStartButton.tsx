import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

import { buttonStyle } from '../overlay/styles.js';

export interface WalkStartButtonProps {
  readonly label: string;
  /** 'returned' after a walk ends, so focus comes back to the control that started it. */
  readonly focus: 'first' | 'returned';
  readonly onPress: () => void;
}

/** "Walk the park" in the viewer toolbar. */
export function WalkStartButton({ label, focus, onPress }: WalkStartButtonProps): ReactElement {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focus === 'returned') button.current?.focus();
  }, [focus]);
  return (
    <button ref={button} type="button" style={buttonStyle} onClick={onPress}>
      {label}
    </button>
  );
}
