import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Color, DoubleSide, ShaderMaterial } from 'three';

import { HATCH, HATCH_OPACITY } from '../../editor/hatch.js';

const VERTEX = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// The same stripe as hatchCoverage in editor/hatch.ts, in CSS pixels from gl_FragCoord.
const FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uOpacity;
uniform float uPeriod;
uniform float uStripe;
uniform float uPixelRatio;
void main() {
  vec2 px = gl_FragCoord.xy / uPixelRatio;
  float phase = mod(px.x + px.y, uPeriod);
  float cover = clamp(uStripe * 0.5 - abs(phase - uPeriod * 0.5) + 0.5, 0.0, 1.0);
  if (cover <= 0.0) discard;
  gl_FragColor = vec4(uColour, uOpacity * cover);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Pulls the decal toward the camera in the depth test so it does not flicker on the terrain.
const DEPTH_NUDGE = -2;

/**
 * Screen-space diagonal stripes in one colour with clear gaps, for zones where terraforming is
 * blocked. One material serves every zone, and the pixel ratio follows the canvas.
 */
export function useHatchMaterial(colour: string): ShaderMaterial {
  const dpr = useThree((state) => state.viewport.dpr);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uColour: { value: new Color(colour) },
          uOpacity: { value: HATCH_OPACITY },
          uPeriod: { value: HATCH.periodPx },
          uStripe: { value: HATCH.stripePx },
          uPixelRatio: { value: 1 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: DEPTH_NUDGE,
        polygonOffsetUnits: DEPTH_NUDGE,
      }),
    [colour],
  );
  useEffect(() => {
    const ratio = material.uniforms.uPixelRatio;
    if (ratio !== undefined) ratio.value = dpr;
  }, [material, dpr]);
  useEffect(
    () => () => {
      material.dispose();
    },
    [material],
  );
  return material;
}
