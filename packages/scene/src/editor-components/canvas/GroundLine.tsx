import { Line } from '@react-three/drei';
import type { ReactElement } from 'react';

import type { PlanePoint } from '@parkshape/core';

import { LIFT_M, type EditorView } from './editor-view.js';

export interface GroundLineProps {
  readonly view: EditorView;
  readonly points: readonly PlanePoint[];
  readonly colour: string;
  readonly closed?: 'closed' | 'open';
  readonly width?: number;
  readonly dashed?: 'dashed' | 'solid';
}

const LINE_WIDTH_PX = 3;
const MIN_POINTS = 2;

/** A line draped on the terrain at each point, in local metres. */
export function GroundLine(props: GroundLineProps): ReactElement | null {
  const { view, points, colour } = props;
  const first = points[0];
  if (first === undefined || points.length < MIN_POINTS) return null;
  const ring = props.closed === 'closed' ? [...points, first] : points;
  const vertices = ring.map(
    (point) => [point.x, view.ctx.elevationAt(point) + LIFT_M, point.y] as [number, number, number],
  );
  return (
    <Line
      points={vertices}
      color={colour}
      lineWidth={props.width ?? LINE_WIDTH_PX}
      dashed={props.dashed === 'dashed'}
      depthTest={false}
      renderOrder={1}
    />
  );
}
