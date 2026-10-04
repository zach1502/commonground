import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { useStore } from 'zustand';

import {
  samplePolyline,
  SLOPE_SAMPLE_STEP_M,
  type Heightmap,
  type MetricsReport,
  type PlanePoint,
} from '@parkshape/core';

import { FeatureMesh } from '../../components/FeatureMesh.js';
import { buildRibbon } from '../../geometry/ribbon.js';
import type { GroundPoint } from '../../types.js';

import type { EditorView } from './editor-view.js';

const HIGHLIGHT_LIFT_M = 0.06;
const HIGHLIGHT_WIDEN_M = 0.4;
// A segment k spans samples k and k + 1, so a run ends two samples past its last index.
const SAMPLES_PAST_LAST_SEGMENT = 2;

/** Splits sorted segment indexes into contiguous runs, so each run draws as one ribbon. */
function contiguousRuns(indexes: readonly number[]): number[][] {
  const runs: number[][] = [];
  for (const index of [...indexes].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last !== undefined && index === (last.at(-1) ?? -1) + 1) last.push(index);
    else runs.push([index]);
  }
  return runs;
}

function toGround(points: readonly PlanePoint[]): GroundPoint[] {
  return points.map((point) => ({ x: point.x, z: point.y }));
}

export interface SteepSegmentHighlightProps {
  readonly view: EditorView;
  readonly report: MetricsReport | null;
  readonly heightmap: Heightmap;
}

/**
 * Red ribbon sub-ranges over the path segments the report marks above the running slope limit.
 * Existing paths are the park as it is today, so they get no ribbon.
 */
export function SteepSegmentHighlight({
  view,
  report,
  heightmap,
}: SteepSegmentHighlightProps): ReactElement | null {
  const document = useStore(view.ctx.store, (state) => state.document);
  const ribbons = useMemo(() => {
    if (report === null) return [];
    return report.details.pathSlopes.flatMap((slopes) => {
      const path = document.paths.find((candidate) => candidate.id === slopes.pathId);
      if (path === undefined || slopes.existing || slopes.runningSegments.length === 0) return [];
      const samples = samplePolyline(path.points, SLOPE_SAMPLE_STEP_M);
      return contiguousRuns(slopes.runningSegments).map((run, index) => {
        const from = run[0] ?? 0;
        const to = (run.at(-1) ?? from) + SAMPLES_PAST_LAST_SEGMENT;
        const arrays = buildRibbon(heightmap, toGround(samples.slice(from, to)), {
          widthM: path.widthM + HIGHLIGHT_WIDEN_M,
          liftM: HIGHLIGHT_LIFT_M,
        });
        return { id: `${slopes.pathId}-${String(index)}`, arrays };
      });
    });
  }, [report, document, heightmap]);
  if (ribbons.length === 0) return null;
  return (
    <group renderOrder={3}>
      {ribbons.map((ribbon) => (
        <FeatureMesh key={ribbon.id} arrays={ribbon.arrays} colour={view.palette.danger} />
      ))}
    </group>
  );
}
