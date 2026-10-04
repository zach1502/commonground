import type { ReactElement } from 'react';

import type { Heightmap } from '@parkshape/core';

import type { MotionPreference } from '../motion/rise.js';
import type { ScenePalette } from '../palette/colours.js';
import type { RenderFeatures } from '../perf/render-tier.js';
import type { SceneModel } from '../scene-model.js';
import type { AssetManifest, ParkDocument } from '../types.js';

import { AreaFeatures } from './AreaFeatures.js';
import { InstancedItems } from './InstancedItems.js';
import { PathRibbons } from './PathRibbons.js';
import { WaterFeatures } from './WaterFeatures.js';

export interface DesignFeaturesProps {
  readonly heightmap: Heightmap;
  readonly document: ParkDocument;
  readonly model: SceneModel;
  readonly palette: ScenePalette;
  readonly manifest?: AssetManifest | undefined;
  readonly features: RenderFeatures;
  readonly motion: MotionPreference;
}

/** Everything the resident added on top of the terrain. */
export function DesignFeatures(props: DesignFeaturesProps): ReactElement {
  const { heightmap, document, model, palette, features } = props;
  const water = features.water === 'animated' && props.motion === 'full' ? 'animated' : 'still';
  return (
    <>
      <AreaFeatures layouts={model.areas} palette={palette} />
      <PathRibbons
        heightmap={heightmap}
        paths={document.paths}
        palette={palette}
        detail={features.detailMaps}
      />
      <WaterFeatures
        heightmap={heightmap}
        water={document.water}
        palette={palette}
        motion={water}
      />
      <InstancedItems groups={model.groups} palette={palette} manifest={props.manifest} />
    </>
  );
}
