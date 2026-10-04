import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { Shape, type ShaderMaterial } from 'three';
import { useStore } from 'zustand';

import { lockedTrees, type PlanePoint } from '@parkshape/core';

import { QUARTER_TURN } from '../../geometry/vector-layout.js';

import { LIFT_M, type EditorView } from './editor-view.js';
import { GroundLine } from './GroundLine.js';
import { useHatchMaterial } from './hatch-material.js';

const CIRCLE_SEGMENTS = 32;
const OUTLINE_PX = 2;
const FULL_TURN = Math.PI + Math.PI;

function polygonShape(points: readonly PlanePoint[]): Shape {
  const shape = new Shape();
  points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  });
  shape.closePath();
  return shape;
}

function circlePoints(centre: PlanePoint, radiusM: number): PlanePoint[] {
  return Array.from({ length: CIRCLE_SEGMENTS }, (_, step) => {
    const angle = (step / CIRCLE_SEGMENTS) * FULL_TURN;
    return { x: centre.x + Math.cos(angle) * radiusM, y: centre.y + Math.sin(angle) * radiusM };
  });
}

interface HatchedProps {
  readonly view: EditorView;
  readonly outline: readonly PlanePoint[];
  readonly material: ShaderMaterial;
}

/** One blocked zone: the stripes over its ground and a solid edge in the same colour. */
function HatchedZone({ view, outline, material }: HatchedProps): ReactElement | null {
  const shape = useMemo(() => polygonShape(outline), [outline]);
  if (outline.length === 0) return null;
  // The decal is flat, so it sits at the mean ground height of its edge.
  const ground =
    outline.reduce((sum, point) => sum + view.ctx.elevationAt(point), 0) / outline.length;
  return (
    <>
      <mesh
        position={[0, ground + LIFT_M, 0]}
        rotation={[QUARTER_TURN, 0, 0]}
        renderOrder={2}
        material={material}
      >
        <shapeGeometry args={[shape]} />
      </mesh>
      <GroundLine
        view={view}
        points={outline}
        colour={view.palette.danger}
        closed="closed"
        width={OUTLINE_PX}
      />
    </>
  );
}

/**
 * Red hatching over no-grade zones and locked-tree root zones while terraforming. The stripes
 * are drawn in screen space, so they read as hatching at every zoom, not as a flat patch.
 */
export function BlockedZonesOverlay({ view }: { readonly view: EditorView }): ReactElement | null {
  const { ctx, palette } = view;
  const tool = useStore(ctx.store, (state) => state.tool);
  const document = useStore(ctx.store, (state) => state.document);
  const material = useHatchMaterial(palette.danger);
  const outlines = useMemo(() => {
    const noGrade = ctx.zones.filter((zone) => zone.kind === 'noGrade');
    const roots = lockedTrees(document, ctx.catalog).map((tree) => ({
      id: tree.id,
      polygon: circlePoints(tree.position, ctx.terraform.rootZonePerDbhCm * tree.dbhCm),
    }));
    return [...noGrade.map((zone) => ({ id: zone.id, polygon: zone.polygon })), ...roots];
  }, [ctx.zones, ctx.catalog, ctx.terraform.rootZonePerDbhCm, document]);
  if (tool.kind !== 'terraform') return null;
  return (
    <group>
      {outlines.map((zone) => (
        <HatchedZone key={zone.id} view={view} outline={zone.polygon} material={material} />
      ))}
    </group>
  );
}
