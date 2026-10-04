import type { ReactElement } from 'react';
import { DoubleSide, Shape } from 'three';
import { useStore } from 'zustand';

import type { MetricsReport, PlanePoint, Zone } from '@parkshape/core';

import { QUARTER_TURN } from '../../geometry/vector-layout.js';

import { LIFT_M, type EditorView } from './editor-view.js';

const FILL_OPACITY = 0.25;

function polygonShape(points: readonly PlanePoint[]): Shape {
  const shape = new Shape();
  points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  });
  shape.closePath();
  return shape;
}

export interface ForbiddenZoneOverlayProps {
  readonly view: EditorView;
  readonly report: MetricsReport | null;
}

/**
 * Translucent fills over closed zones, so residents see where nothing goes: the project's
 * forbidden zones once metrics are in, and any zone a planner drew in this document.
 */
export function ForbiddenZoneOverlay({
  view,
  report,
}: ForbiddenZoneOverlayProps): ReactElement | null {
  const { ctx, palette } = view;
  const drawn = useStore(ctx.store, (state) => state.document.zones);
  const projectZones = report === null ? [] : ctx.zones.filter((zone) => zone.kind === 'forbidden');
  const zones: readonly Zone[] = [...projectZones, ...drawn];
  if (zones.length === 0) return null;
  return (
    <group>
      {zones.map((zone) => (
        <mesh
          key={zone.id}
          position={[0, ctx.elevationAt(zone.polygon[0]) + LIFT_M, 0]}
          rotation={[QUARTER_TURN, 0, 0]}
          renderOrder={2}
        >
          <shapeGeometry args={[polygonShape(zone.polygon)]} />
          <meshBasicMaterial
            color={zone.kind === 'forbidden' ? palette.danger : palette.warning}
            transparent
            opacity={FILL_OPACITY}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
