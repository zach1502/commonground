import { Environment, Lightformer } from '@react-three/drei';
import { useLayoutEffect, useMemo } from 'react';
import type { ReactElement, RefObject } from 'react';
import { Object3D } from 'three';
import type { DirectionalLight } from 'three';

import { RESET_HEADING_RAD } from '../camera/presets.js';
import type { SceneBounds } from '../geometry/sample.js';
import { QUARTER_TURN } from '../geometry/vector-layout.js';
import type { ScenePalette } from '../palette/colours.js';

import { lightRig, sunPosition } from './lighting.js';
import type { FillLight } from './lighting.js';

export interface SceneLightsProps {
  readonly bounds: SceneBounds;
  readonly palette: ScenePalette;
  readonly fill: FillLight;
  /** Shadow map size in pixels; 0 turns the sun's shadow off. */
  readonly shadowMapPx: number;
  readonly sunRef: RefObject<DirectionalLight>;
  /** The camera heading the sun turns from; the park view's reset heading by default. */
  readonly headingRad?: number;
  /** Half the side of the sun's shadow camera; 100 m around the parcel by default. */
  readonly shadowHalfSideM?: number;
  /** The sun's height above the horizon; DESIGN.md's 40 degrees by default. */
  readonly sunElevationRad?: number;
}

// DESIGN.md "Shadows": the shadow camera covers 100 m each way from the parcel centre.
const SHADOW_HALF_SIDE_M = 100;
const SHADOW_NEAR_M = 1;
const SHADOW_FAR_M = 400;
// Raise the normal bias to 0.08 before touching the bias, if stripes show on slopes.
const SHADOW_BIAS = -0.0005;
const SHADOW_NORMAL_BIAS = 0.04;

// Environment map size; fill light is soft, so a tiny cube is enough.
const ENVIRONMENT_RESOLUTION = 64;
const SKY_FORMER_INTENSITY = 0.7;
const GROUND_FORMER_INTENSITY = 0.3;
// Planes far bigger than the cube camera's view, so each covers a whole hemisphere.
const FORMER_SCALE = 100;
const FORMER_OFFSET = 5;

interface FillProps {
  readonly sky: string;
  readonly ground: string;
}

/** Sky above and soil below, drawn once into an environment map; nothing is downloaded. */
function GeneratedFill({ sky, ground }: FillProps): ReactElement {
  return (
    <Environment resolution={ENVIRONMENT_RESOLUTION} frames={1} background={false}>
      <Lightformer
        form="rect"
        color={sky}
        intensity={SKY_FORMER_INTENSITY}
        scale={FORMER_SCALE}
        position={[0, FORMER_OFFSET, 0]}
        rotation-x={QUARTER_TURN}
      />
      <Lightformer
        form="rect"
        color={ground}
        intensity={GROUND_FORMER_INTENSITY}
        scale={FORMER_SCALE}
        position={[0, -FORMER_OFFSET, 0]}
        rotation-x={-QUARTER_TURN}
      />
    </Environment>
  );
}

/** Warm side sun aimed at the parcel centre, sky over soil hemisphere fill and a low ambient. */
export function SceneLights(props: SceneLightsProps): ReactElement {
  const { bounds, palette, fill, shadowMapPx, sunRef } = props;
  const half = props.shadowHalfSideM ?? SHADOW_HALF_SIDE_M;
  const rig = lightRig(palette, fill);
  const sun = sunPosition(bounds, props.headingRad ?? RESET_HEADING_RAD, props.sunElevationRad);
  const target = useMemo(() => new Object3D(), []);
  target.position.set(sun.target.x, sun.target.y, sun.target.z);
  useLayoutEffect(() => {
    const light = sunRef.current;
    if (light === null) return;
    // The park does not move, so the map redraws only when ShadowRefresh asks.
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
  }, [sunRef, shadowMapPx]);
  const casts = shadowMapPx > 0;
  return (
    <>
      <primitive object={target} />
      {rig.environment === undefined ? null : <GeneratedFill {...rig.environment} />}
      <hemisphereLight
        args={[rig.hemisphere.sky, rig.hemisphere.ground, rig.hemisphere.intensity]}
      />
      {rig.ambient > 0 ? <ambientLight intensity={rig.ambient} /> : null}
      <directionalLight
        ref={sunRef}
        castShadow={casts}
        shadow-mapSize={[Math.max(shadowMapPx, 1), Math.max(shadowMapPx, 1)]}
        shadow-bias={SHADOW_BIAS}
        shadow-normalBias={SHADOW_NORMAL_BIAS}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={SHADOW_NEAR_M}
        shadow-camera-far={SHADOW_FAR_M}
        position={[sun.position.x, sun.position.y, sun.position.z]}
        target={target}
        color={rig.sun.colour}
        intensity={rig.sun.intensity}
      />
    </>
  );
}
