import type { Object3D, WebGLRenderer } from 'three';

/** What an end-to-end test can read about the live scene, through the dev page. */
export interface SceneReport {
  readonly toneMapping: number;
  readonly outputColorSpace: string;
  readonly exposure: number;
  readonly shadowMap: 'on' | 'off';
  readonly shadowMapPx: number;
  readonly shadowAutoUpdate: 'on' | 'off';
  readonly shadowCasters: number;
  readonly drawCalls: number;
  /** How many times the sun's shadow map has been drawn since the probe mounted. */
  readonly shadowRedraws: number;
  readonly frame: number;
  readonly composerPasses: readonly string[];
}

export type SceneInspector = () => SceneReport;

interface ShadowLight {
  readonly isDirectionalLight?: boolean;
  readonly castShadow: boolean;
  readonly shadow?: { readonly mapSize: { readonly x: number }; readonly autoUpdate: boolean };
}

function sunOf(scene: Object3D): ShadowLight | undefined {
  let found: ShadowLight | undefined;
  scene.traverse((node) => {
    const light = node as unknown as ShadowLight;
    if (light.isDirectionalLight === true) found = light;
  });
  return found;
}

function casterCount(scene: Object3D): number {
  let count = 0;
  scene.traverse((node) => {
    if (node.castShadow && (node as { isMesh?: boolean }).isMesh === true) count += 1;
  });
  return count;
}

export interface InspectSources {
  readonly gl: WebGLRenderer;
  readonly scene: Object3D;
  readonly composerPasses: () => readonly string[];
  readonly shadowRedraws: () => number;
}

/**
 * Counts shadow map draws by watching the sun's needsUpdate flag just before three.js draws
 * the shadow maps; returns the counter and a function that restores the renderer.
 */
export function countShadowRedraws(
  gl: WebGLRenderer,
  scene: Object3D,
): {
  readonly count: () => number;
  readonly stop: () => void;
} {
  let redraws = 0;
  const original = gl.shadowMap.render.bind(gl.shadowMap);
  gl.shadowMap.render = (...args: Parameters<typeof original>) => {
    const shadow = sunOf(scene)?.shadow as { needsUpdate?: boolean } | undefined;
    if (gl.shadowMap.enabled && shadow?.needsUpdate === true) redraws += 1;
    original(...args);
  };
  return {
    count: () => redraws,
    stop: () => {
      gl.shadowMap.render = original;
    },
  };
}

/** Reads the renderer and scene settings the scene rules in DESIGN.md name. */
export function inspectScene(sources: InspectSources): SceneReport {
  const { gl, scene, composerPasses } = sources;
  const sun = sunOf(scene);
  const mapped = gl.shadowMap.enabled && sun?.castShadow === true;
  return {
    toneMapping: gl.toneMapping,
    outputColorSpace: gl.outputColorSpace,
    exposure: gl.toneMappingExposure,
    shadowMap: mapped ? 'on' : 'off',
    shadowMapPx: mapped ? (sun.shadow?.mapSize.x ?? 0) : 0,
    shadowAutoUpdate: sun?.shadow?.autoUpdate === true ? 'on' : 'off',
    shadowCasters: casterCount(scene),
    drawCalls: gl.info.render.calls,
    shadowRedraws: sources.shadowRedraws(),
    frame: gl.info.render.frame,
    composerPasses: composerPasses(),
  };
}
