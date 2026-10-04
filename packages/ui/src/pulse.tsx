import { useEffect, useRef, useState, type ReactNode } from 'react';

import { classNames } from './class-names.js';
import { MOTION_CLASS } from './motion/index.js';

export interface PulseProps {
  readonly children: ReactNode;
  /** The pulse plays once whenever this value changes, but never on the first render. */
  readonly pulseKey: number | string;
}

/** Wraps content and flashes it once each time pulseKey changes, to mark a fresh value. */
export function Pulse({ children, pulseKey }: PulseProps) {
  const previous = useRef<number | string | null>(null);
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (previous.current !== null && previous.current !== pulseKey) {
      setPulsing(true);
    }
    previous.current = pulseKey;
  }, [pulseKey]);
  return (
    <div
      className={classNames('ps-pulse', pulsing ? MOTION_CLASS.pulse : '')}
      onAnimationEnd={() => {
        setPulsing(false);
      }}
    >
      {children}
    </div>
  );
}
