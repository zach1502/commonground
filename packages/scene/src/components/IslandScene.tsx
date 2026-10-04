import { PerformanceMonitor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { lazy, Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import { Color } from 'three';
import type { DirectionalLight } from 'three';

import type { Heightmap } from '@parkshape/core';

import type { GroundHeight } from '../camera/limits.js';
import { elevationAt } from '../geometry/sample.js';
import { linearRgb } from '../geometry/terrain-colours.js';
import type { ScenePalette } from '../palette/colours.js';
import type { RenderFeatures, RenderProfile } from '../perf/render-tier.js';
import type { GroundPoint, ParkDocument } from '../types.js';

import { BlobShadows } from './BlobShadows.js';
import { Controls } from './Controls.js';
import { DesignFeatures } from './DesignFeatures.js';
import { Dressing } from './Dressing.js';
import { fillFor, sceneTone } from './lighting.js';
import { composerCode } from './post-effects-chunk.js';
import { composerPasses } from './post-effects.js';
import { RisingIsland } from './RisingIsland.js';
import { SceneLights } from './SceneLights.js';
import { FrameProbe, InspectProbe, ReadySignal } from './SceneProbes.js';
import { ShadowRefresh, useShadowRefresh } from './ShadowRefresh.js';
import { TerrainMesh } from './TerrainMesh.js';
import { inverseAcesFilmic } from './tone.js';
import type { ViewerCanvasProps } from './viewer-props.js';

export interface IslandSceneProps extends ViewerCanvasProps {
  readonly profile: RenderProfile;
  readonly features: RenderFeatures;
  readonly onDecline: () => void;
}

/**
 * The sky as the renderer should clear to it. With the composer on, the whole frame is tone
 * mapped afterwards, so the sky is the colour that ACES maps back to the palette sky. The fog
 * keeps the palette sky: the inverse is brighter than 1, and fog toward it washes the park out.
 */
function skyColour(palette: ScenePalette, features: RenderFeatures): Color {
  if (features.composer === 'off') return new Color(palette.sky);
  // The composer's ACES pass runs at the renderer's exposure for the tier.
  const [r, g, b] = inverseAcesFilmic(linearRgb(palette.sky), sceneTone(features).exposure);
  return new Color(r, g, b);
}

/** Keeps the renderer's exposure on the tier's value, also after a decline to the phone tier. */
function ToneExposure({ exposure }: { readonly exposure: number }): null {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    gl.toneMappingExposure = exposure;
    invalidate();
  }, [gl, exposure, invalidate]);
  return null;
}

const grounds = new WeakMap<Heightmap, GroundHeight>();

/** Ground height under a point of the terrain the scene draws, one function per heightmap. */
function groundOf(terrain: Heightmap): GroundHeight {
  const known = grounds.get(terrain);
  if (known !== undefined) return known;
  const ground: GroundHeight = (point) => elevationAt(terrain, point);
  grounds.set(terrain, ground);
  return ground;
}

/** Garden outlines, which the terrain draws in soilDark. */
function gardenBeds(document: ParkDocument): readonly (readonly GroundPoint[])[] {
  return document.areas.filter((area) => area.kind === 'garden').map((area) => area.outline);
}

function Probes(props: IslandSceneProps): ReactElement {
  return (
    <>
      {props.onFrameTime === undefined ? null : <FrameProbe onFrameTime={props.onFrameTime} />}
      {props.onInspect === undefined ? null : (
        <InspectProbe
          onInspect={props.onInspect}
          composerPasses={() => composerPasses(props.features)}
        />
      )}
    </>
  );
}

/** The design on the island: its features, the blob shadows of the phone tier and the dressing. */
function DesignLayer(props: IslandSceneProps): ReactElement {
  const { model, palette, features } = props;
  return (
    <>
      <DesignFeatures
        heightmap={props.heightmap}
        document={props.document}
        model={model}
        palette={palette}
        manifest={props.manifest}
        features={features}
        motion={props.motion}
      />
      {features.shadows === 'blob' ? <BlobShadows groups={model.groups} /> : null}
      <Dressing
        heightmap={props.heightmap}
        document={props.document}
        groups={model.groups}
        palette={palette}
        bounds={model.bounds}
        features={features}
        motion={props.motion}
      />
    </>
  );
}

function NothingToDraw(): null {
  return null;
}

/**
 * The composer, loaded only for tiers that draw it. The gate suspends inside the scene's own
 * boundary until the code is in, so the ready signal never fires before the composer can draw.
 */
function useComposer(composer: RenderFeatures['composer']) {
  return useMemo(() => {
    const code = composerCode({ composer });
    if (code === null) return null;
    return {
      Effects: lazy(async () => ({ default: await code })),
      Gate: lazy(async () => {
        await code;
        return { default: NothingToDraw };
      }),
    };
  }, [composer]);
}

/** Everything inside the canvas: sky, lights, the rising island, controls and test probes. */
export function IslandScene(props: IslandSceneProps): ReactElement {
  const { model, palette, profile, features } = props;
  const sunRef = useRef<DirectionalLight>(null);
  const refreshShadow = useShadowRefresh(sunRef);
  const sky = useMemo(() => skyColour(palette, features), [palette, features]);
  const tone = sceneTone(features);
  const beds = useMemo(() => gardenBeds(props.document), [props.document]);
  const composer = useComposer(features.composer);
  return (
    <>
      <color attach="background" args={[sky]} />
      <fogExp2 attach="fog" args={[palette.sky, tone.fogDensity]} />
      <ToneExposure exposure={tone.exposure} />
      {profile.tier === 'desktop' ? <PerformanceMonitor onDecline={props.onDecline} /> : null}
      <SceneLights
        bounds={model.bounds}
        palette={palette}
        fill={fillFor(profile)}
        shadowMapPx={features.shadowMapPx}
        sunRef={sunRef}
      />
      <Suspense fallback={null}>
        <RisingIsland motion={props.motion} onMove={refreshShadow}>
          <group {...props.terrainEvents}>
            <TerrainMesh
              heightmap={props.terrain}
              palette={palette}
              beds={beds}
              detail={features.detailMaps}
            />
          </group>
          {props.showing === 'design' ? <DesignLayer {...props} /> : null}
          {props.children}
        </RisingIsland>
        <ShadowRefresh
          refresh={refreshShadow}
          document={props.document}
          terrain={props.terrain}
          showing={props.showing}
        />
        {composer === null ? null : <composer.Gate />}
        <ReadySignal onReady={props.onReady} />
      </Suspense>
      <Controls
        bounds={model.bounds}
        view={props.view}
        onStart={props.onCameraStart}
        keys={props.keys ?? 'none'}
        motion={props.motion}
        ground={groundOf(props.terrain)}
      />
      {composer === null ? null : (
        <Suspense fallback={null}>
          <composer.Effects />
        </Suspense>
      )}
      <Probes {...props} />
    </>
  );
}
