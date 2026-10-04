import type { CatalogIndex } from '../catalog/catalog.js';
import type { HeightmapIssue } from '../errors.js';
import { computeMetrics } from '../metrics/compute.js';
import { designFootprints } from '../metrics/footprints.js';
import { heightmapIssues, type Heightmap } from '../metrics/heightmap.js';
import { emptyMask } from '../metrics/raster.js';
import { failedConstraints, type MetricsReport } from '../metrics/report.js';
import type { Random } from '../ports/random.js';
import { err, ok, type Result } from '../result.js';
import type { DesignDocument, Zone } from '../schema/design.js';
import type { ProjectParameters } from '../schema/parameters.js';
import type { Parcel } from '../schema/parcel.js';

import { carryBaseline, type Carry } from './carry.js';
import { explainNote, type LayoutNote } from './explain.js';
import { planFeatures, type FeaturePlan } from './features.js';
import { edgeDistance, type Place } from './hints.js';
import type { Intent } from './intent.js';
import { buildLayout, type Layout, type LayoutContext } from './layout.js';
import { layoutNotes } from './notes.js';
import { repairPlan } from './repair.js';
import { buildSite, pointOf, type Site } from './site.js';
import { entranceCells, isBlocked, siteBlockers, suitabilityGrid } from './suitability.js';

const ENTRANCE_LABELS = ['entrance', 'gate', 'street', 'road'];
/** Homes and fences sit along the parcel boundary. */
const BOUNDARY_LABELS = ['house', 'home', 'neighbour', 'fence', 'boundary'];

export interface SolveInput {
  readonly intent: Intent;
  readonly parcel: Parcel;
  readonly heightmap: Heightmap;
  readonly parameters: ProjectParameters;
  readonly catalog: CatalogIndex;
  /**
   * The park as it is. Locked elements always carry over. Unlocked ones carry over unchanged
   * unless the intent removes (count 0), moves or resizes them.
   */
  readonly baseline: DesignDocument;
  /** Zones to keep in the document; forbidden ones block, like parameters.forbiddenZones. */
  readonly zones: readonly Zone[];
  readonly random: Random;
}

export type SolveError =
  | { readonly kind: 'invalidTerrain'; readonly issues: readonly HeightmapIssue[] }
  | { readonly kind: 'emptyParcel' };

export interface SolvedLayout {
  readonly document: DesignDocument;
  readonly notes: readonly string[];
}

function places(
  site: Site,
  kept: DesignDocument,
  catalog: CatalogIndex,
  entrances: readonly number[],
): Place[] {
  const elements = designFootprints({ document: kept, catalog, grid: site.grid }).map(
    (footprint) => ({
      labels: [footprint.entry.name.toLowerCase(), footprint.entry.id, footprint.entry.category],
      mask: footprint.mask,
    }),
  );
  const gates = emptyMask(site.grid);
  entrances.forEach((cell) => {
    gates.cells[cell] = 1;
  });
  const boundary = emptyMask(site.grid);
  edgeDistance(site).forEach((distance, index) => {
    if (site.parcel.cells[index] === 1 && distance <= site.grid.cellM) boundary.cells[index] = 1;
  });
  return [
    ...elements,
    { labels: ENTRANCE_LABELS, mask: gates },
    { labels: BOUNDARY_LABELS, mask: boundary },
  ];
}

function contextFor(input: SolveInput, site: Site, kept: DesignDocument): LayoutContext {
  const { catalog, parameters } = input;
  const zones = [...parameters.forbiddenZones, ...input.zones];
  const blockers = siteBlockers({
    site,
    baseline: kept,
    zones,
    catalog,
    rootZonePerDbhCm: parameters.treeProtection.rootZonePerDbhCm,
  });
  const score = suitabilityGrid(site, blockers);
  const free = Uint8Array.from(score, (_, index) =>
    site.parcel.cells[index] === 1 && !isBlocked(blockers, index) ? 1 : 0,
  );
  const entrances = entranceCells(site, free);
  return {
    site,
    blockers,
    score,
    free,
    entrances: entrances.map((cell) => pointOf(site.grid, cell)),
    places: places(site, kept, catalog, entrances),
    catalog,
    parameters,
    intent: input.intent,
    kept,
    baseline: input.baseline,
    zones: input.zones,
  };
}

function measure(input: SolveInput, document: DesignDocument): MetricsReport | undefined {
  const { parcel, parameters, catalog, heightmap, baseline } = input;
  const result = computeMetrics({ document, parcel, parameters, catalog, heightmap, baseline });
  return result.ok ? result.value : undefined;
}

function remainingFailures(report: MetricsReport | undefined): LayoutNote[] {
  if (report === undefined) return [];
  return failedConstraints(report).map((key) => ({
    kind: 'stillFailing',
    message: report.constraints[key].message,
  }));
}

function finish(site: Site, layout: Layout, notes: readonly LayoutNote[]): SolvedLayout {
  const sentences = [...layoutNotes(site, layout), ...notes].map(explainNote);
  return {
    document: layout.document,
    notes: sentences.filter((note, index) => sentences.indexOf(note) === index),
  };
}

/** New features from the intent, after the reworked existing areas. */
function planFrom(carry: Carry, catalog: CatalogIndex): FeaturePlan {
  const plan = planFeatures(carry.intent, catalog);
  return { features: [...carry.reworks, ...plan.features], trees: plan.trees };
}

/**
 * Turns a resident's intent into a draft on the real terrain: features by fit and hint, paths by
 * A*, trees by Poisson-disc scatter, then one repair pass for hard rules. It starts from the
 * baseline and keeps what the intent does not change. Deterministic per Random.
 */
export function solveLayout(input: SolveInput): Result<SolvedLayout, SolveError> {
  const issues = heightmapIssues(input.heightmap);
  if (issues.length > 0) return err({ kind: 'invalidTerrain', issues });
  const site = buildSite(input.parcel, input.heightmap);
  if (site.parcelCells === 0) return err({ kind: 'emptyParcel' });
  const carry = carryBaseline(input.intent, input.baseline, input.catalog);
  const context = contextFor(input, site, carry.kept);
  const plan = planFrom(carry, input.catalog);
  const first = buildLayout(context, plan, input.random);
  const report = measure(input, first.document);
  const repair =
    report === undefined
      ? undefined
      : repairPlan({ ...input, document: first.document, plan, report });
  if (repair === undefined) return ok(finish(site, first, remainingFailures(report)));
  const second = buildLayout(context, repair.plan, input.random);
  const secondReport = measure(input, second.document);
  const stillShort = secondReport?.constraints.requiredFeatures.status === 'fail';
  return ok(
    finish(site, second, [...(stillShort ? [] : repair.notes), ...remainingFailures(secondReport)]),
  );
}
