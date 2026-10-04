import { Html, Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Vector3 as ThreeVector } from 'three';

import { anchorPoint, catalogIndex, type PlanePoint } from '@parkshape/core';

import { frameOn } from '../camera/presets.js';
import type { ReviewLayerProps } from '../components/viewer-modes.js';
import { SELECTION_OUTLINE_PX } from '../editor/overlay-style.js';
import type { SceneBounds } from '../geometry/sample.js';
import { flyCamera, type OrbitAim } from '../motion/camera-fly.js';
import type { MotionPreference } from '../motion/rise.js';
import type { ScenePalette } from '../palette/colours.js';

import { commentChipSpots, visibleChipIds, type CommentChipSpot } from './chips.js';
import { CommentChip } from './CommentChip.js';
import { selectionOutline } from './outline.js';

// Lines sit this far above the ground so they do not flicker into it, as the editor's do.
const LINE_LIFT_M = 0.08;
// A chip floats this far above its anchor, clear of a bench or a lawn.
const CHIP_LIFT_M = 2.5;
const CHIP_Z_INDEX = 20;
const CHIP_LAYERS: [number, number] = [CHIP_Z_INDEX, 0];
const PASS_THROUGH = { pointerEvents: 'none' } as const;

export interface ReviewLayerSceneProps {
  readonly review: ReviewLayerProps;
  readonly elevationAt: (point: PlanePoint) => number;
  readonly palette: ScenePalette;
  readonly motion: MotionPreference;
  readonly bounds: SceneBounds;
}

function SelectionLines({ review, elevationAt, palette }: ReviewLayerSceneProps) {
  const { selected, design } = review;
  const lines = useMemo(
    () => (selected === undefined ? [] : selectionOutline(design, catalogIndex, selected)),
    [design, selected],
  );
  return (
    <>
      {lines.map((line, index) => {
        const first = line.points[0];
        const ring =
          line.closed === 'closed' && first !== undefined ? [...line.points, first] : line.points;
        const vertices = ring.map(
          (point) =>
            [point.x, elevationAt(point) + LINE_LIFT_M, point.y] as [number, number, number],
        );
        return (
          <Line
            key={`${review.selected?.elementId ?? ''}-${String(index)}`}
            points={vertices}
            color={palette.focus}
            lineWidth={SELECTION_OUTLINE_PX}
            depthTest={false}
            renderOrder={1}
          />
        );
      })}
    </>
  );
}

/** Rechecks which chips show whenever a frame draws, and keeps the last set while it holds. */
function useVisibleChips(spots: readonly CommentChipSpot[]): ReadonlySet<string> {
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const lastKey = useRef('');
  const forward = useMemo(() => new ThreeVector(), []);
  useFrame(({ camera, controls }) => {
    camera.getWorldDirection(forward);
    const aim = (controls as OrbitAim | null)?.target ?? { x: 0, z: 0 };
    const ids = visibleChipIds(spots, {
      focus: { x: aim.x, y: aim.z },
      camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      forward: { x: forward.x, y: forward.y, z: forward.z },
    });
    const key = ids.join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;
    setShown(new Set(ids));
  });
  return shown;
}

function Chips({ review, elevationAt, motion }: ReviewLayerSceneProps) {
  const { design, counts, chipLabel } = review;
  const spots = useMemo(
    () => commentChipSpots(design, counts, elevationAt),
    [design, counts, elevationAt],
  );
  const shown = useVisibleChips(spots);
  return (
    <>
      {spots
        .filter((spot) => shown.has(spot.elementId))
        .map((spot) => (
          <Html
            key={spot.elementId}
            position={[spot.point.x, spot.elevationM + CHIP_LIFT_M, spot.point.y]}
            center
            zIndexRange={CHIP_LAYERS}
            pointerEvents="none"
            style={PASS_THROUGH}
          >
            <CommentChip
              count={spot.count}
              label={chipLabel(spot.elementId, spot.count)}
              motion={motion}
            />
          </Html>
        ))}
    </>
  );
}

/** Flies the camera to the selected element each time the page asks, over 400 ms. */
function useFrameSelected({ review, elevationAt, motion, bounds }: ReviewLayerSceneProps) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitAim | null;
  const invalidate = useThree((state) => state.invalidate);
  const { frameRequest, selected, design } = review;
  const handled = useRef(frameRequest);
  useEffect(() => {
    if (frameRequest === handled.current || selected === undefined) return;
    handled.current = frameRequest;
    const point = anchorPoint(design, { elementId: selected.elementId });
    if (point === undefined) return;
    const focus = { x: point.x, y: elevationAt(point), z: point.y };
    flyCamera({ camera, controls, to: frameOn(focus, bounds), motion, invalidate });
  }, [frameRequest, selected, design, elevationAt, bounds, camera, controls, motion, invalidate]);
}

/** Review mode inside the canvas: the selected element's outline and the comment count chips. */
export function ReviewLayer(props: ReviewLayerSceneProps): ReactElement {
  useFrameSelected(props);
  return (
    <>
      <SelectionLines {...props} />
      <Chips {...props} />
    </>
  );
}
