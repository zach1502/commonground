import {
  Color,
  DataTexture,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  Vector2,
} from 'three';
import type { IUniform } from 'three';

import { waterNormalTexels } from '../geometry/water.js';

const NORMAL_TEXELS = 128;
// One ripple tile covers 6 m of pond.
const RIPPLE_TILE_M = 6;
const NORMAL_SCALE = 0.35;
// DESIGN.md: water is the only surface under roughness 0.5; still water is a little rougher.
const ANIMATED_ROUGHNESS = 0.15;
const STILL_ROUGHNESS = 0.2;
// research-3d.md: fresnel power 3 mixing toward the sky colour at grazing angles.
const FRESNEL_POWER = 3;
const FRESNEL_STRENGTH = 0.6;
// The second map repeats at a different size so the two ripple sets do not line up.
const SECOND_MAP_SCALE = 0.73;
const GLSL_DECIMALS = 2;

const SINGLE_SAMPLE = 'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;';
const DOUBLE_SAMPLE = `vec3 mapA = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	vec3 mapB = texture2D( normalMap, vNormalMapUv * ${String(SECOND_MAP_SCALE)} + uSecondOffset ).xyz * 2.0 - 1.0;
	vec3 mapN = normalize( vec3( mapA.xy + mapB.xy, mapA.z * mapB.z ) );`;
const FRESNEL = `float facing = clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 );
	outgoingLight = mix( outgoingLight, uFresnelColour, pow( 1.0 - facing, ${FRESNEL_POWER.toFixed(1)} ) * ${FRESNEL_STRENGTH.toFixed(GLSL_DECIMALS)} );
	#include <opaque_fragment>`;

export interface WaterMaterial {
  readonly material: MeshStandardMaterial;
  readonly normalMap: DataTexture;
  /** Offset of the second normal sample, which the shader reads each frame. */
  readonly secondOffset: IUniform<Vector2>;
}

function rippleTexture(): DataTexture {
  const texture = new DataTexture(
    waterNormalTexels(NORMAL_TEXELS),
    NORMAL_TEXELS,
    NORMAL_TEXELS,
    RGBAFormat,
  );
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / RIPPLE_TILE_M, 1 / RIPPLE_TILE_M);
  texture.needsUpdate = true;
  return texture;
}

/**
 * The stylised pond: standard material, two scrolling samples of one ripple normal map and a
 * fresnel tint toward the sky, added in onBeforeCompile so the scene draws only once.
 */
export function waterMaterial(
  colours: { water: string; sky: string },
  motion: 'animated' | 'still',
): WaterMaterial {
  const normalMap = rippleTexture();
  const secondOffset: IUniform<Vector2> = { value: new Vector2() };
  const material = new MeshStandardMaterial({
    color: colours.water,
    roughness: motion === 'animated' ? ANIMATED_ROUGHNESS : STILL_ROUGHNESS,
    metalness: 0,
    normalMap,
    normalScale: new Vector2(NORMAL_SCALE, NORMAL_SCALE),
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const fresnelColour = new Color(colours.sky);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSecondOffset = secondOffset;
    shader.uniforms.uFresnelColour = { value: fresnelColour };
    shader.fragmentShader =
      `uniform vec2 uSecondOffset;\nuniform vec3 uFresnelColour;\n${shader.fragmentShader}`
        .replace(SINGLE_SAMPLE, DOUBLE_SAMPLE)
        .replace('#include <opaque_fragment>', FRESNEL);
  };
  return { material, normalMap, secondOffset };
}
