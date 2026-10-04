// The flat plan poster. It imports no three.js, so a page can show it on first load.
export {
  PLAN_POSTER_HEIGHT,
  PLAN_POSTER_WIDTH,
  planPosterSvg,
  planPosterUrl,
  type PlanPosterInput,
} from './plan-poster/plan-poster.js';
export { documentPropertyReader, readPalette, type ScenePalette } from './palette/colours.js';
// The models index reader is three-free too, so pages can load it before the viewer chunk.
export { assetManifestFromModels } from './assets/model-manifest.js';
export type { AssetManifest } from './types.js';
// The one models index hook every scene view uses; three-free, so a page can start it early.
export { useModelManifest, type ModelManifestState } from './assets/use-model-manifest.js';
