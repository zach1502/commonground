import { useRef, useState } from 'react';
import type { PointerEvent, ReactElement } from 'react';

import type { WalkEngine } from './walk-engine.js';
import { knobStyle, padStyle, PAD_SIZE_PX } from './walk-styles.js';

const HALF = 0.5;
// The knob travels half the pad's radius, so it never leaves the pad.
const KNOB_TRAVEL_SHARE = 0.25;
const CENTRE = { x: 0, y: 0 };

export interface WalkPadProps {
  readonly engine: WalkEngine;
  readonly label: string;
}

/** The push from the pad's centre, each axis -1 to 1 at the rim, up the screen as forward. */
function pushOf(event: PointerEvent<HTMLDivElement>) {
  const box = event.currentTarget.getBoundingClientRect();
  const radius = Math.max(box.width * HALF, 1);
  const dx = (event.clientX - (box.left + box.width * HALF)) / radius;
  const dy = (event.clientY - (box.top + box.height * HALF)) / radius;
  const length = Math.hypot(dx, dy);
  const scale = length > 1 ? 1 / length : 1;
  return { x: dx * scale, y: dy * scale };
}

/**
 * The touch walk pad: drag the knob forward, back or sideways to walk at up to walking pace,
 * let go to stop. Keys, the turn buttons and tap to walk do the same without it, so screen
 * readers skip it.
 */
export function WalkPad({ engine, label }: WalkPadProps): ReactElement {
  const [offset, setOffset] = useState(CENTRE);
  const held = useRef<'held' | 'free'>('free');
  const push = (event: PointerEvent<HTMLDivElement>) => {
    const { x, y } = pushOf(event);
    const travel = PAD_SIZE_PX * KNOB_TRAVEL_SHARE;
    setOffset({ x: x * travel, y: y * travel });
    engine.setStick({ forward: -y, strafe: x });
  };
  const letGo = () => {
    held.current = 'free';
    setOffset(CENTRE);
    engine.setStick(undefined);
  };
  return (
    <div
      data-walk-pad=""
      aria-hidden="true"
      title={label}
      style={padStyle}
      onPointerDown={(event) => {
        held.current = 'held';
        const pad = event.currentTarget;
        // jsdom has no pointer capture; browsers do.
        if ('setPointerCapture' in pad) pad.setPointerCapture(event.pointerId);
        push(event);
      }}
      onPointerMove={(event) => {
        if (held.current === 'held') push(event);
      }}
      onPointerUp={letGo}
      onPointerCancel={letGo}
    >
      <span style={knobStyle(offset)} />
    </div>
  );
}
