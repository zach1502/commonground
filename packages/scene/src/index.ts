export { gridCellCount } from './grid.js';
export type * from './types.js';
export { ParkViewer } from './components/ParkViewer.js';
export type { ParkViewerProps } from './components/ParkViewer.js';
export type { ReviewLayerProps, WalkProps } from './components/viewer-modes.js';
export type { WalkStrings } from './walk/strings.js';
export type { WalkProbe } from './walk/WalkCamera.js';
export type { ViewerStrings } from './overlay/strings.js';
export type { ContextLayerInput } from './context/ContextLayer.js';
export type { CompareShowing } from './overlay/CompareToggle.js';
export type { ForcedTier, RenderTier } from './perf/render-tier.js';
export type { SceneInspector, SceneReport } from './components/inspect.js';
export {
  buildTerrainMesh,
  skirtRingSize,
  surfaceIndexCount,
  writeGridRegion,
} from './geometry/terrain-mesh.js';
export type { MeshRegion } from './geometry/terrain-mesh.js';
export { buildRibbon } from './geometry/ribbon.js';
export {
  buildAreaMesh,
  fillModules,
  nearestPanelIndex,
  samplePerimeter,
} from './geometry/area-fill.js';
export type { ModuleGrid, PanelTransform, Perimeter } from './geometry/area-fill.js';
export { buildWaterDisc } from './geometry/water.js';
export type { WaterDisc, WaterOptions } from './geometry/water.js';
export {
  groupInstances,
  instanceMatrix,
  ScaleError,
  UnknownCatalogItemError,
} from './geometry/instances.js';
export type { InstanceError, InstanceGroup, InstanceTransform } from './geometry/instances.js';
export { elevationAt, heightmapBounds } from './geometry/sample.js';
export type { SceneBounds } from './geometry/sample.js';
export { heightmapFrom } from './geometry/synthetic-heightmap.js';
export { meshGroundArea, polygonArea } from './geometry/measure.js';
export {
  cameraPreset,
  clampPolarAngle,
  frameOn,
  MAX_POLAR_ANGLE_RAD,
  MIN_POLAR_ANGLE_RAD,
  PRESET_NAMES,
} from './camera/presets.js';
export type { CameraPose, PresetName } from './camera/presets.js';
export {
  PALETTE_FALLBACKS,
  PALETTE_PROPERTIES,
  readPalette,
  statusColour,
} from './palette/colours.js';
export type { ScenePalette, Status } from './palette/colours.js';
export { percentile } from './perf/frame-times.js';
export { gridToRgba, singleHueRamp } from './heatmap/heat-ramp.js';
export type { HeatRamp } from './heatmap/heat-ramp.js';
export { buildDrapeArrays } from './heatmap/drape.js';
export type { DrapeArrays, HeatGridFrame } from './heatmap/drape.js';
export { FULL_TURN, symmetric } from './geometry/vector-layout.js';
export * from './editor-entry.js';
export { ParkEditor } from './editor-components/canvas/ParkEditor.js';
export type { ParkEditorProps } from './editor-components/canvas/ParkEditor.js';
