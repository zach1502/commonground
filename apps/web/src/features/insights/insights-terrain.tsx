import {
  designDocumentSchema,
  parcelSchema,
  type DesignDocument,
  type Heightmap,
} from '@parkshape/core';
import {
  HeatmapOverlay,
  OverlayCheckbox,
  ParkViewer,
  viewerScene,
  type ForcedTier,
} from '@parkshape/scene/viewer';

import type { InsightsHeatmap } from '../../api/staff-api';
import type { Project } from '../../api/web-api';
import { WebGlMissingNotice } from '../../design/webgl-missing-notice';
import { messages } from '../../messages';
import { viewerStrings } from '../../viewer-strings';

import { bareGround } from './bare-ground';

const BARE = designDocumentSchema.parse({
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
});

export interface InsightsTerrainProps {
  readonly project: Project;
  readonly baseline: DesignDocument | null;
  /** The recorded ground; null or absent draws the flat parcel. */
  readonly terrain?: Heightmap | null | undefined;
  readonly heatmap: InsightsHeatmap;
  readonly opacity: number;
  /** Hidden leaves off all the design content, so only the ground and the heatmap draw. */
  readonly items: 'shown' | 'hidden';
  /** The Hide items box in the view's toolbar. */
  readonly onItems: (items: 'shown' | 'hidden') => void;
  readonly tier?: ForcedTier | undefined;
}

/** The park today in 3D with one heatmap draped over the ground. Loaded on its own. */
export function InsightsTerrain(props: InsightsTerrainProps) {
  const { project, baseline, heatmap, opacity, tier } = props;
  const ground = baseline ?? BARE;
  const scene = viewerScene(
    props.items === 'hidden' ? bareGround(ground) : ground,
    parcelSchema.parse(project.parcel),
    props.terrain ?? undefined,
  );
  return (
    <ParkViewer
      heightmap={scene.heightmap}
      document={scene.document}
      catalog={scene.catalog}
      mode="view"
      strings={viewerStrings()}
      webGlMissing={<WebGlMissingNotice projectId={project.id} />}
      tools={
        <OverlayCheckbox
          label={messages.insights.heatmap.hideItems}
          checked={props.items === 'hidden' ? 'on' : 'off'}
          onChange={(checked) => {
            props.onItems(checked === 'on' ? 'hidden' : 'shown');
          }}
        />
      }
      {...(tier === undefined ? {} : { tier })}
    >
      <HeatmapOverlay heightmap={scene.heightmap} grid={heatmap} opacity={opacity} />
    </ParkViewer>
  );
}
