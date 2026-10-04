import { useId } from 'react';
import type { ReactElement } from 'react';

import { overlayStyle, progressTrackStyle } from './styles.js';

export interface LoadingOverlayProps {
  /** Percent loaded, from 0 to 100. */
  readonly progress: number;
  readonly message: string;
}

const PERCENT = 100;

/** Real loading progress with the name of the data source. */
export function LoadingOverlay({ progress, message }: LoadingOverlayProps): ReactElement {
  const messageId = useId();
  const percent = Math.round(Math.min(Math.max(progress, 0), PERCENT));
  return (
    <div style={overlayStyle}>
      <p id={messageId}>{message}</p>
      <div
        role="progressbar"
        aria-labelledby={messageId}
        aria-valuemin={0}
        aria-valuemax={PERCENT}
        aria-valuenow={percent}
        style={progressTrackStyle}
      >
        <div
          style={{
            inlineSize: `${String(percent)}%`,
            blockSize: '100%',
            background: 'var(--surface-color-primary-button-default)',
          }}
        />
      </div>
    </div>
  );
}
