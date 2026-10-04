import type { CatalogIndex } from '../catalog/catalog.js';
import { areaPlotCount } from '../metrics/plots.js';
import type { MetricsReport } from '../metrics/report.js';
import type { CatalogItem } from '../schema/catalog.js';
import type { DesignDocument } from '../schema/design.js';
import type { ProjectParameters, RequiredFeature } from '../schema/parameters.js';

import type { LayoutNote } from './explain.js';
import { entryFor, type FeaturePlan, type PlacedEntry, type PlannedFeature } from './features.js';

export interface RepairInput {
  readonly document: DesignDocument;
  /** The park as it is today, so a kept garden counts its recorded plots as metrics do. */
  readonly baseline: DesignDocument;
  readonly plan: FeaturePlan;
  readonly parameters: ProjectParameters;
  readonly catalog: CatalogIndex;
  readonly report: MetricsReport;
}

export interface Repair {
  readonly plan: FeaturePlan;
  readonly notes: readonly LayoutNote[];
}

function matches(entry: CatalogItem, feature: RequiredFeature): boolean {
  return 'category' in feature
    ? entry.category === feature.category
    : entry.id === feature.catalogId;
}

/** How many matching elements the document has and how many plots they fit. */
function tally(input: RepairInput, feature: RequiredFeature) {
  const { document, catalog, baseline } = input;
  const items = document.items.filter((item) => {
    const entry = catalog.get(item.catalogId);
    return entry !== undefined && matches(entry, feature);
  });
  let plots = 0;
  const areas = document.areas.filter((area) => {
    const entry = catalog.get(area.catalogId);
    if (entry?.geometryKind !== 'area' || !matches(entry, feature)) return false;
    plots += areaPlotCount(entry, area, baseline.areas);
    return true;
  });
  return { count: items.length + areas.length, plots };
}

function sized(entry: PlacedEntry, minPlots: number | undefined): PlannedFeature {
  const sizing =
    minPlots === undefined
      ? ({ kind: 'preset', size: 'medium' } as const)
      : ({ kind: 'plots', minPlots } as const);
  return { entry, sizing, origin: 'repair' };
}

interface Fix {
  readonly features: PlannedFeature[];
  readonly trees: FeaturePlan['trees'][number][];
  readonly notes: LayoutNote[];
}

function addMissing(fix: Fix, entry: CatalogItem, feature: RequiredFeature, missing: number): void {
  if (entry.category === 'tree') {
    fix.trees.push({ count: missing });
    return;
  }
  if (entry.geometryKind === 'linear') return;
  for (let added = 0; added < missing; added += 1)
    fix.features.push(sized(entry, feature.minPlots));
  fix.notes.push({ kind: 'added', name: entry.name });
}

/** Makes the first planned match big enough for every plot, or adds one when none was planned. */
function enlarge(fix: Fix, entry: PlacedEntry, feature: RequiredFeature, shortBy: number): void {
  const minPlots = feature.minPlots ?? 0;
  const index = fix.features.findIndex((planned) => matches(planned.entry, feature));
  const planned = fix.features[index];
  if (planned === undefined) {
    fix.features.push(sized(entry, shortBy));
    fix.notes.push({ kind: 'added', name: entry.name });
    return;
  }
  fix.features[index] = { ...planned, sizing: { kind: 'plots', minPlots } };
  fix.notes.push({ kind: 'enlarged', name: planned.entry.name, plots: minPlots });
}

function fixFeature(input: RepairInput, fix: Fix, feature: RequiredFeature): void {
  const entry = entryFor(input.catalog, feature);
  if (entry === undefined) return;
  const { count, plots } = tally(input, feature);
  if (count < feature.minCount) {
    addMissing(fix, entry, feature, feature.minCount - count);
    return;
  }
  const minPlots = feature.minPlots ?? 0;
  if (plots < minPlots && entry.geometryKind === 'area')
    enlarge(fix, entry, feature, minPlots - plots);
}

/**
 * The plan changed to fix hard failures that have a known fix: a missing required feature is
 * added and a garden short of plots is enlarged. Undefined when there is nothing to fix.
 */
export function repairPlan(input: RepairInput): Repair | undefined {
  if (input.report.constraints.requiredFeatures.status !== 'fail') return undefined;
  const fix: Fix = { features: [...input.plan.features], trees: [...input.plan.trees], notes: [] };
  input.parameters.requiredFeatures.forEach((feature) => {
    fixFeature(input, fix, feature);
  });
  if (fix.notes.length === 0 && fix.trees.length === input.plan.trees.length) return undefined;
  return { plan: { features: fix.features, trees: fix.trees }, notes: fix.notes };
}
