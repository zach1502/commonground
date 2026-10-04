import { Html } from '@react-three/drei';
import type { ReactElement } from 'react';
import { useStore } from 'zustand';

import { selectedAreaSummary } from '../../editor/actions/areas.js';
import type { Gesture } from '../../editor/actions/gestures.js';
import { rectangleFromDrag } from '../../editor/area-tool.js';
import { selectedAreas } from '../../editor/store/selectors.js';
import { fill, formatArea } from '../strings.js';
import { badgeStyle } from '../styles.js';

import { LAYERS, LIFT_M, PASS_THROUGH, type EditorView } from './editor-view.js';
import { GroundLine } from './GroundLine.js';
import type { HandleDown } from './PathOverlay.js';

const HANDLE_SIZE_M = 0.8;
const LABEL_LIFT_M = 2;

function Summary({ view }: { view: EditorView }): ReactElement | null {
  const state = useStore(view.ctx.store, (current) => current);
  const summary = selectedAreaSummary(state, view.ctx.catalog);
  const { tool } = state;
  const at =
    tool.kind === 'area' && tool.draft !== null
      ? tool.draft.end
      : selectedAreas(state)[0]?.polygon[2];
  if (summary === null || at === undefined) return null;
  const label = fill(view.strings.properties.areaSummary, {
    area: formatArea(summary.areaM2),
    plots: summary.plots,
  });
  return (
    <Html
      position={[at.x, view.ctx.elevationAt(at) + LABEL_LIFT_M, at.y]}
      zIndexRange={[LAYERS.label, LAYERS.floor]}
      pointerEvents="none"
      style={PASS_THROUGH}
    >
      <span role="status" style={{ ...badgeStyle, pointerEvents: 'none' }}>
        {label}
      </span>
    </Html>
  );
}

export interface AreaOverlayProps {
  readonly view: EditorView;
  readonly gesture: Gesture;
  readonly onHandleDown: HandleDown;
}

/** The rectangle being dragged, corner handles on a selected area, and its live summary. */
export function AreaOverlay({ view, gesture, onHandleDown }: AreaOverlayProps): ReactElement {
  const state = useStore(view.ctx.store, (current) => current);
  const { tool } = state;
  const draft =
    (tool.kind === 'area' || tool.kind === 'zone') && tool.draft !== null
      ? rectangleFromDrag(tool.draft.start, tool.draft.end)
      : null;
  const draftColour = tool.kind === 'zone' ? view.palette.danger : view.palette.info;
  return (
    <>
      {draft === null ? null : (
        <GroundLine view={view} points={draft} colour={draftColour} closed="closed" />
      )}
      {selectedAreas(state).map((area) => {
        const polygon = area.polygon.map((point, index) =>
          gesture.kind === 'corner' &&
          gesture.id === area.id &&
          gesture.index === index &&
          gesture.point !== null
            ? gesture.point
            : point,
        );
        return (
          <group key={area.id}>
            <GroundLine view={view} points={polygon} colour={view.palette.info} closed="closed" />
            {polygon.map((point, index) => (
              <mesh
                key={index}
                position={[point.x, view.ctx.elevationAt(point) + LIFT_M, point.y]}
                onPointerDown={(event) => {
                  onHandleDown({ kind: 'corner', id: area.id, index }, event);
                }}
              >
                <boxGeometry args={[HANDLE_SIZE_M, HANDLE_SIZE_M, HANDLE_SIZE_M]} />
                <meshBasicMaterial color={view.palette.info} depthTest={false} />
              </mesh>
            ))}
          </group>
        );
      })}
      <Summary view={view} />
    </>
  );
}
