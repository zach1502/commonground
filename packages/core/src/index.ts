export * from './constants.js';
export { clamp } from './clamp.js';
export type { Clock } from './ports/clock.js';
export type { Random } from './ports/random.js';
export { SystemClock } from './adapters/system-clock.js';
export { FakeClock } from './adapters/fake-clock.js';
export { createSeededRandom } from './adapters/seeded-random.js';
export * from './schema/ids.js';
export * from './schema/units.js';
export * from './schema/geometry.js';
export { clipPolygonToBox, ringArea, type PlaneBox } from './schema/polygon-clip.js';
export * from './schema/catalog.js';
export * from './schema/project.js';
export * from './schema/design.js';
export * from './schema/parameters.js';
export * from './schema/parcel.js';
export * from './schema/self-report.js';
export * from './schema/vote.js';
export { plainTextSchema } from './schema/plain-text.js';
export {
  CONTEXT_FEATURE_KINDS,
  compareContextFeatures,
  contextFeatureKindSchema,
  contextFeatureSchema,
  contextGeometrySchema,
  contextSourceSchema,
  siteContextSchema,
  type ContextFeature,
  type ContextFeatureKind,
  type ContextGeometry,
  type ContextSource,
  type SiteContext,
} from './context/context-feature.js';
export {
  ENTRANCE_SNAP_INSET_M,
  ENTRANCE_SNAP_RADIUS_M,
  sidewalkLinesOf,
  snapEntrance,
  type EntranceSnap,
  type EntranceSnapInput,
} from './context/entrance-snap.js';
export {
  COMMENT_KIND_LABEL_KEYS,
  COMMENT_KINDS,
  canComment,
  canEdit,
  canModerate,
  commentKindSchema,
  commentStatusSchema,
  elementCommentSchema,
  newElementCommentSchema,
  plannerReplySchema,
  type CommentKind,
  type CommentStatus,
  type CommentTarget,
  type ElementComment,
  type NewElementComment,
  type PlannerReply,
} from './review/element-comment.js';
export {
  anchorPoint,
  carriedComments,
  elementLabel,
  formatElementLabel,
  resolveAnchor,
  type AnchorError,
  type AnchorInput,
  type ElementLabel,
  type ElementRef,
  type ResolvedAnchor,
} from './review/comment-anchor.js';
export {
  catalogIndex,
  catalogItems,
  modulePlotCount,
  type CatalogIndex,
} from './catalog/catalog.js';
export { moduleKitItems } from './catalog/module-kit.js';
export { validateDesignAgainstCatalog, type CatalogIssue } from './catalog/design-references.js';
export {
  validateDesignText,
  type DesignSummary,
  type ValidationReport,
} from './validate-command.js';
export { ok, err, type Result } from './result.js';
export {
  constraintViolation,
  invalidDocument,
  type ConstraintViolation,
  type CoreError,
  type DocumentIssue,
  type HeightmapIssue,
  type InvalidDocument,
  type PathSurfaceIssue,
} from './errors.js';
export { computeMetrics, type MetricsInput } from './metrics/compute.js';
export {
  failedConstraints,
  isSubmittable,
  requireSubmittable,
  type ConstraintResult,
  type ConstraintStatus,
  type MetricsDetails,
  type MeterSubjects,
  type MetricsReport,
  type MetricsTotals,
} from './metrics/report.js';
export {
  measurePathSlopes,
  samplePolyline,
  type PathSlopes,
  type SlopeLimits,
} from './metrics/slopes.js';
export {
  makeFlatHeightmap,
  makeRampHeightmap,
  sampleAt,
  slopeAt,
  withGradeDelta,
  type Heightmap,
} from './metrics/heightmap.js';
export {
  formatCad,
  formatCubicMetres,
  formatMetres,
  formatPercent,
  formatPercentValue,
  plural,
} from './metrics/format.js';
export { parcelGrid, type GridSize } from './metrics/parcel-grid.js';
export {
  BOX_GROUND_MIN_SHARE,
  fillsItsBox,
  isOnGround,
  withGroundOutline,
} from './metrics/ground-outline.js';
export { fitModules, type ModuleFit, type ModulePlacement } from './metrics/modules.js';
export { plotsRecordedInside } from './metrics/plots.js';
export {
  designFootprints,
  elementKindSchema,
  type ElementKind,
  type Footprint,
  type FootprintInput,
} from './metrics/footprints.js';
export {
  cellCentre,
  countCells,
  emptyMask,
  gridOf,
  intersectCount,
  maskIndexes,
  rasterizeCircle,
  rasterizeOrientedRect,
  rasterizePolygon,
  type Grid,
  type Mask,
  type OrientedRect,
} from './metrics/raster.js';
export {
  lockedTrees,
  measureTerraform,
  type LockedTree,
  type NoGradeHit,
  type RootZoneHit,
  type TerraformInput,
  type TerraformMeasure,
} from './metrics/terraform.js';
export { score, type ScorePrior, type VoteTally } from './scoring/score.js';
export { rankDesigns, type RankableDesign, type RankedDesign } from './scoring/rank.js';
export { pickQueue, type QueueCandidate, type QueueOptions } from './scoring/queue.js';
export {
  canopyPreferenceSchema,
  characterSchema,
  COMPASS_ZONES,
  compassZoneSchema,
  featureSizeSchema,
  intentCatalogIdSchema,
  intentFeatureSchema,
  intentPlacementSchema,
  intentSchema,
  MAX_DESCRIPTION_CHARS,
  MAX_FEATURE_COUNT,
  MAX_FEATURES,
  MAX_PLACE_NAME_CHARS,
  pathStyleSchema,
  terrainPreferenceSchema,
  type CanopyPreference,
  type Character,
  type CompassZone,
  type FeatureSize,
  type Intent,
  type IntentFeature,
  type IntentPlacement,
  type PathStyle,
  type TerrainPreference,
} from './solver/intent.js';
export {
  solveLayout,
  type SolvedLayout,
  type SolveError,
  type SolveInput,
} from './solver/solve.js';
export {
  computeInsights,
  insightsGrid,
  type HeadlineNumbers,
  type Insights,
} from './insights/compute-insights.js';
export type {
  InsightDesign,
  InsightMetrics,
  InsightsInput,
  InsightVote,
  Participant,
} from './insights/types.js';
export {
  HEATMAP_CATEGORIES,
  HEATMAP_GROUPS,
  HEATMAP_LAYERS,
  roundedValues,
  type Heatmap,
  type HeatmapCategory,
  type HeatmapGroup,
  type HeatmapGroupId,
  type HeatmapLayer,
} from './insights/heatmaps.js';
export { SITE_SECTIONS } from './insights/baseline-diff.js';
export type { BaselineFeatureDiff, SiteSection } from './insights/baseline-diff.js';
export type { ComplianceCounts } from './insights/compliance.js';
export type { EarthworksBin, EarthworksHistogram } from './insights/earthworks-histogram.js';
export type {
  EngagementBreakdown,
  EngagementCell,
  SuppressedCount,
} from './insights/engagement.js';
export type { FeatureFrequency } from './insights/feature-frequency.js';
export { reasonFrequency } from './insights/reasons.js';
export type { DesignReasons, ReasonCount, ReasonFrequency } from './insights/reasons.js';
export { csvChunks, CSV_HEADER } from './insights/exports/csv.js';
export { geoJsonChunks } from './insights/exports/geojson.js';
export { dxfChunks } from './insights/exports/dxf.js';
export {
  joinChunks,
  type ExportInput,
  type RankedInsightDesign,
} from './insights/exports/top-designs.js';
