import type { ThreeEvent } from '@react-three/fiber';
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { useStore } from 'zustand';

import { withGradeDelta, type PlanePoint } from '@parkshape/core';

import { PathRibbons } from '../../components/PathRibbons.js';
import type { Gesture } from '../../editor/actions/gestures.js';
import { insertPathMidpoint } from '../../editor/actions/paths.js';
import { draftPathFeature } from '../../editor/path-draft.js';
import {
  catmullRom,
  CURVE_SAMPLES_PER_SPAN,
  gradeStatus,
  segmentGrades,
  segmentMidpoints,
} from '../../editor/path-tool.js';
import { selectedPaths } from '../../editor/store/selectors.js';
import { useDraftTick } from '../../motion/use-path-tick.js';

import { LIFT_M, type EditorView } from './editor-view.js';
import { GroundLine } from './GroundLine.js';
import { HANDLE_RADIUS_M, HANDLE_SEGMENTS } from './handle-size.js';
import { PathTick } from './PathTick.js';

const PLUS_ARM_M = 1.2;
const PLUS_THICKNESS_M = 0.25;
// Over the draft ribbon the grade line is a hairline, so the surface itself reads.
const DRAFT_GRADE_LINE_PX = 1;

const NO_POINTS: readonly PlanePoint[] = [];

export type HandleDown = (
  handle: { readonly kind: 'vertex' | 'corner'; readonly id: string; readonly index: number },
  event: ThreeEvent<PointerEvent>,
) => void;

/** Each span of the curve, coloured by the grade of the segment it follows. */
function GradedCurve({
  view,
  points,
  widthPx,
}: {
  view: EditorView;
  points: readonly PlanePoint[];
  widthPx?: number;
}): ReactElement {
  const curve = catmullRom(points, CURVE_SAMPLES_PER_SPAN);
  const grades = segmentGrades(points, view.ctx.elevationAt);
  return (
    <>
      {grades.map((grade, span) => (
        <GroundLine
          key={span}
          view={view}
          colour={view.palette[gradeStatus(grade)]}
          {...(widthPx === undefined ? {} : { width: widthPx })}
          points={curve.slice(
            span * CURVE_SAMPLES_PER_SPAN,
            (span + 1) * CURVE_SAMPLES_PER_SPAN + 1,
          )}
        />
      ))}
    </>
  );
}

function Handle(props: {
  view: EditorView;
  at: PlanePoint;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const { view, at } = props;
  return (
    <mesh
      position={[at.x, view.ctx.elevationAt(at) + LIFT_M, at.y]}
      {...(props.onPointerDown === undefined ? {} : { onPointerDown: props.onPointerDown })}
    >
      <sphereGeometry args={[HANDLE_RADIUS_M, HANDLE_SEGMENTS, HANDLE_SEGMENTS]} />
      <meshBasicMaterial color={view.palette.info} depthTest={false} />
    </mesh>
  );
}

function Plus({ view, at, onClick }: { view: EditorView; at: PlanePoint; onClick: () => void }) {
  const y = view.ctx.elevationAt(at) + LIFT_M;
  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onClick();
  };
  return (
    <group position={[at.x, y, at.y]} onClick={click}>
      <mesh>
        <boxGeometry args={[PLUS_ARM_M, PLUS_THICKNESS_M, PLUS_THICKNESS_M]} />
        <meshBasicMaterial color={view.palette.info} depthTest={false} />
      </mesh>
      <mesh>
        <boxGeometry args={[PLUS_THICKNESS_M, PLUS_THICKNESS_M, PLUS_ARM_M]} />
        <meshBasicMaterial color={view.palette.info} depthTest={false} />
      </mesh>
    </group>
  );
}

/** The path being drawn, as the ribbon it will become, with the grade line along its middle. */
function DraftPath({ view }: { view: EditorView }): ReactElement | null {
  const { ctx, palette } = view;
  const tool = useStore(ctx.store, (state) => state.tool);
  const ghost = useStore(ctx.store, (state) => state.ghost);
  const document = useStore(ctx.store, (state) => state.document);
  const heightmap = useMemo(
    () => withGradeDelta(ctx.baseHeightmap, document.gradeDelta),
    [ctx.baseHeightmap, document.gradeDelta],
  );
  const { tick, finish } = useDraftTick(tool.kind === 'path' ? tool.draft : NO_POINTS);
  if (tool.kind !== 'path') return null;
  const points = ghost === null ? tool.draft : [...tool.draft, ghost.position];
  const draft = draftPathFeature({ points, surface: tool.surface, catalog: ctx.catalog });
  return (
    <>
      {draft === null ? null : (
        <PathRibbons heightmap={heightmap} paths={[draft]} palette={palette} detail="off" />
      )}
      <GradedCurve view={view} points={points} widthPx={DRAFT_GRADE_LINE_PX} />
      {tool.draft.map((point, index) =>
        tick?.index === index ? null : <Handle key={index} view={view} at={point} />,
      )}
      {tick === null ? null : <PathTick key={tick.index} view={view} tick={tick} onDone={finish} />}
    </>
  );
}

export interface PathOverlayProps {
  readonly view: EditorView;
  readonly gesture: Gesture;
  readonly onHandleDown: HandleDown;
}

/** The path being drawn, and the vertex and midpoint handles of a selected path. */
export function PathOverlay({ view, gesture, onHandleDown }: PathOverlayProps): ReactElement {
  const document = useStore(view.ctx.store, (state) => state.document);
  const selection = useStore(view.ctx.store, (state) => state.selection);
  const paths = useMemo(
    () => selectedPaths({ ...view.ctx.store.getState(), document, selection }),
    [document, selection, view.ctx.store],
  );
  return (
    <>
      <DraftPath view={view} />
      {paths.map((path) => {
        const points = path.points.map((point, index) =>
          gesture.kind === 'vertex' &&
          gesture.id === path.id &&
          gesture.index === index &&
          gesture.point !== null
            ? gesture.point
            : point,
        );
        return (
          <group key={path.id}>
            <GradedCurve view={view} points={points} />
            {points.map((point, index) => (
              <Handle
                key={index}
                view={view}
                at={point}
                onPointerDown={(event) => {
                  onHandleDown({ kind: 'vertex', id: path.id, index }, event);
                }}
              />
            ))}
            {segmentMidpoints(points).map((point, index) => (
              <Plus
                key={index}
                view={view}
                at={point}
                onClick={() => {
                  insertPathMidpoint(view.ctx, path.id, index);
                }}
              />
            ))}
          </group>
        );
      })}
    </>
  );
}
