import type { ReactElement } from 'react';
import { MeshStandardMaterial } from 'three';
import { BoxGeometry, CylinderGeometry } from 'three';

import type { AreaLayout } from '../geometry/area-layout.js';
import type { ScenePalette } from '../palette/colours.js';

import { FeatureMesh } from './FeatureMesh.js';
import { InstancedPart } from './InstancedPart.js';
import { useDisposable } from './use-disposable.js';

const HALF = 0.5;
const POST_RADIUS_M = 0.05;
const POST_HEIGHT_M = 1.2;
const POST_SEGMENTS = 6;
const PANEL_HEIGHT_M = 1;
const PANEL_THICKNESS_M = 0.04;
const PANEL_CLEARANCE_M = 0.1;
const BED_HEIGHT_M = 0.4;

interface AreaProps {
  readonly layout: AreaLayout;
  readonly palette: ScenePalette;
}

function Fence({ layout, palette }: AreaProps): ReactElement | null {
  const fence = layout.fence;
  const panelLength = fence?.panelLengthM ?? 1;
  const [post, panel, wood] = useDisposable(
    () =>
      [
        new CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, POST_HEIGHT_M, POST_SEGMENTS).translate(
          0,
          POST_HEIGHT_M * HALF,
          0,
        ),
        new BoxGeometry(panelLength, PANEL_HEIGHT_M, PANEL_THICKNESS_M).translate(
          0,
          PANEL_CLEARANCE_M + PANEL_HEIGHT_M * HALF,
          0,
        ),
        new MeshStandardMaterial({ color: palette.soilDark, roughness: 1 }),
      ] as const,
    [panelLength, palette],
  );
  if (fence === undefined) {
    return null;
  }
  return (
    <>
      <InstancedPart
        key={`posts-${String(fence.posts.length)}`}
        geometry={post}
        material={wood}
        transforms={fence.posts}
        shadow="receive"
      />
      <InstancedPart
        key={`panels-${String(fence.panels.length)}`}
        geometry={panel}
        material={wood}
        transforms={fence.panels}
        shadow="receive"
      />
    </>
  );
}

function Beds({ layout, palette }: AreaProps): ReactElement | null {
  const grid = layout.bedGrid;
  const [bed, soil] = useDisposable(
    () =>
      [
        new BoxGeometry(grid?.widthM ?? 1, BED_HEIGHT_M, grid?.depthM ?? 1).translate(
          0,
          BED_HEIGHT_M * HALF,
          0,
        ),
        new MeshStandardMaterial({ color: palette.soilDark, roughness: 1 }),
      ] as const,
    [grid, palette],
  );
  if (layout.beds.length === 0) {
    return null;
  }
  return (
    <InstancedPart
      key={String(layout.beds.length)}
      geometry={bed}
      material={soil}
      transforms={layout.beds}
      shadow="receive"
    />
  );
}

export interface AreaFeaturesProps {
  readonly layouts: readonly (AreaLayout & { readonly id: string })[];
  readonly palette: ScenePalette;
}

export function AreaFeatures({ layouts, palette }: AreaFeaturesProps): ReactElement {
  return (
    <>
      {layouts.map((layout) => (
        <group key={layout.id}>
          <FeatureMesh arrays={layout.surface} colour={palette[layout.surfaceColour]} />
          <Fence layout={layout} palette={palette} />
          <Beds layout={layout} palette={palette} />
        </group>
      ))}
    </>
  );
}
