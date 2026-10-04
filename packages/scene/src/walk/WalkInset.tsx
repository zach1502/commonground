import { useEffect, useMemo, useRef } from 'react';
import type { ReactElement } from 'react';

import type { GroundPoint, ParkDocument } from '../types.js';

import type { WalkEngine } from './walk-engine.js';
import { insetStyle } from './walk-styles.js';
import type { WalkerState } from './walk.js';

// Metres of margin around the parcel, so a walker at the edge stays on the map.
const MARGIN_M = 4;
const SIDES = 2;
const DECIMALS = 2;
const DEGREES_PER_TURN = 360;
// The marker is drawn in map metres, scaled to the parcel so it reads at 120 px.
const DOT_SHARE = 0.025;
const WEDGE_SHARE = 0.09;
const WEDGE_HALF_WIDTH = 0.5;

export interface WalkInsetProps {
  readonly engine: WalkEngine;
  readonly parcel: readonly GroundPoint[];
  readonly document: ParkDocument;
}

function num(value: number): string {
  return String(Number(value.toFixed(DECIMALS)) + 0);
}

/** North up, as the design drawing has it: the map's y is the ground's z, flipped. */
function pointList(points: readonly GroundPoint[]): string {
  return points.map((point) => `${num(point.x)},${num(-point.z)}`).join(' ');
}

function frameOf(parcel: readonly GroundPoint[]) {
  const xs = parcel.map((point) => point.x);
  const ys = parcel.map((point) => -point.z);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const viewBox = [
    Math.min(...xs) - MARGIN_M,
    Math.min(...ys) - MARGIN_M,
    width + MARGIN_M * SIDES,
    height + MARGIN_M * SIDES,
  ]
    .map(num)
    .join(' ');
  return { viewBox, size: Math.max(width, height) };
}

function markerTransform(state: WalkerState): string {
  const degrees = (state.headingRad * DEGREES_PER_TURN) / (Math.PI * SIDES);
  return `translate(${num(state.position.x)} ${num(-state.position.z)}) rotate(${num(degrees)})`;
}

/**
 * The "you are here" map: the parcel outline and the paths, with a dot for the walker and a
 * wedge for the heading. It is hidden from screen readers; the live region names the place.
 */
export function WalkInset({ engine, parcel, document }: WalkInsetProps): ReactElement {
  const marker = useRef<SVGGElement>(null);
  const frame = useMemo(() => frameOf(parcel), [parcel]);
  useEffect(() => {
    const draw = () => marker.current?.setAttribute('transform', markerTransform(engine.state()));
    draw();
    return engine.subscribe(draw);
  }, [engine]);
  const dot = frame.size * DOT_SHARE;
  const wedge = frame.size * WEDGE_SHARE;
  return (
    <svg
      aria-hidden="true"
      viewBox={frame.viewBox}
      style={insetStyle}
      preserveAspectRatio="xMidYMid meet"
    >
      <polygon
        data-inset="parcel"
        points={pointList(parcel)}
        fill="var(--surface-color-background-light-gray)"
        stroke="var(--surface-color-border-dark)"
        strokeWidth={dot / SIDES}
      />
      {document.paths.map((path) => (
        <polyline
          key={path.id}
          data-inset="path"
          points={pointList(path.points)}
          fill="none"
          stroke="var(--surface-color-border-default)"
          strokeWidth={path.widthM}
        />
      ))}
      <g ref={marker} data-inset="you" transform={markerTransform(engine.state())}>
        <polygon
          points={`0,0 ${num(-wedge * WEDGE_HALF_WIDTH)},${num(-wedge)} ${num(wedge * WEDGE_HALF_WIDTH)},${num(-wedge)}`}
          fill="var(--surface-color-border-active)"
          opacity={WEDGE_HALF_WIDTH}
        />
        <circle r={dot} fill="var(--surface-color-border-active)" />
      </g>
    </svg>
  );
}
