import type { CSSProperties, ReactElement, ReactNode } from 'react';

import type { PerformanceCaveat } from '../perf/render-tier.js';

export interface SceneGateProps {
  readonly caveat: PerformanceCaveat;
  /** Shown in place of the 3D view without WebGL2; apps pass the message from their locales. */
  readonly fallback?: ReactNode;
  /** The 3D view, drawn only when the browser has WebGL2. */
  readonly children: ReactNode;
}

const fallbackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 'var(--layout-margin-small)',
  blockSize: '100%',
  boxSizing: 'border-box',
  padding: 'var(--layout-padding-large)',
  background: 'var(--surface-color-background-light-gray)',
  font: 'var(--typography-regular-body)',
  color: 'var(--typography-color-primary)',
};

/** The 3D view, or the app's plain message in its place when the browser has no WebGL2. */
export function SceneGate({ caveat, fallback, children }: SceneGateProps): ReactElement {
  if (caveat !== 'missing') return <>{children}</>;
  return (
    <div style={fallbackStyle} data-webgl="missing">
      {fallback}
    </div>
  );
}
