import type { PerformanceCaveat, PointerKind, RenderProbe } from './render-tier.js';

/** The browser calls the probe needs, so a test can hand in fakes. */
export interface ProbeEnvironment {
  readonly createCanvas: () => { getContext: HTMLCanvasElement['getContext'] };
  readonly hardwareConcurrency: number;
  readonly matchMedia: (query: string) => { readonly matches: boolean };
}

// Used when the browser does not report a core count; counts as a desktop.
const UNKNOWN_CORES = 8;

function browserEnvironment(): ProbeEnvironment {
  return {
    createCanvas: () => document.createElement('canvas'),
    hardwareConcurrency: navigator.hardwareConcurrency || UNKNOWN_CORES,
    matchMedia: (query) => window.matchMedia(query),
  };
}

// Renderer names of software rasterisers, which some browsers do not flag as a caveat.
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;

function rendererName(context: unknown): string {
  const gl = context as WebGL2RenderingContext;
  const info = gl.getExtension('WEBGL_debug_renderer_info') as {
    readonly UNMASKED_RENDERER_WEBGL: number;
  } | null;
  return info === null ? '' : String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
}

function loseContext(context: unknown): void {
  const gl = context as WebGL2RenderingContext | null;
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
}

/**
 * A null context with failIfMajorPerformanceCaveat, when a plain WebGL2 context works, means the
 * browser would draw in software or on a blocklisted GPU. A strict context whose renderer is a
 * known software rasteriser, such as SwiftShader, counts as a caveat too. With no WebGL2 context
 * at all the caveat is 'missing', and three.js could not draw.
 */
function caveatOf(environment: ProbeEnvironment): PerformanceCaveat {
  const strict = environment
    .createCanvas()
    .getContext('webgl2', { failIfMajorPerformanceCaveat: true });
  if (strict !== null) {
    const software = SOFTWARE_RENDERER.test(rendererName(strict));
    loseContext(strict);
    return software ? 'major' : 'none';
  }
  const plain = environment.createCanvas().getContext('webgl2');
  loseContext(plain);
  return plain === null ? 'missing' : 'major';
}

/** Gathers the render probe in a browser; pass an environment to test it. */
export function probeRenderTier(environment: ProbeEnvironment = browserEnvironment()): RenderProbe {
  const pointer: PointerKind = environment.matchMedia('(pointer: coarse)').matches
    ? 'coarse'
    : 'fine';
  return {
    majorPerformanceCaveat: caveatOf(environment),
    hardwareConcurrency: environment.hardwareConcurrency,
    pointer,
  };
}
