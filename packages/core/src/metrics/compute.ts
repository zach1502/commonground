import type { CatalogIndex } from '../catalog/catalog.js';
import { validateDesignAgainstCatalog } from '../catalog/design-references.js';
import { invalidDocument, type DocumentIssue, type InvalidDocument } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import type { DesignDocument } from '../schema/design.js';
import type { ConstraintKey, ProjectParameters } from '../schema/parameters.js';
import type { Parcel } from '../schema/parcel.js';
import { cad, cubicMetres, percent } from '../schema/units.js';

import { measureCanopy } from './canopy.js';
import {
  budgetOutcome,
  canopyOutcome,
  countsOutcome,
  featuresOutcome,
  imperviousOutcome,
} from './constraints.js';
import { measureCosts } from './costs.js';
import { categoryCounts, countBreaches, featureShortfalls } from './counts.js';
import { designFootprints, pathEntryId } from './footprints.js';
import { measureFootprintGrades } from './grade-check.js';
import { heightmapIssues, withGradeDelta, type Heightmap } from './heightmap.js';
import type { ConstraintOutcome } from './outcome.js';
import {
  slopesOutcome,
  terraformOutcome,
  treeProtectionOutcome,
  zonesOutcome,
} from './placement-constraints.js';
import { gridOf, rasterizePolygon } from './raster.js';
import {
  buildReport,
  type MeterSubjects,
  type MetricsReport,
  type MetricsTotals,
} from './report.js';
import { measurePathSlopes, type PathSlopes } from './slopes.js';
import { measureSurfaces } from './surfaces.js';
import { lockedTrees, measureTerraform } from './terraform.js';
import { forbiddenZoneHits, lockedOverlaps } from './zones.js';

export interface MetricsInput {
  readonly document: DesignDocument;
  readonly parcel: Parcel;
  readonly parameters: ProjectParameters;
  readonly catalog: CatalogIndex;
  /** Existing terrain. The design's grade delta is applied before slopes are measured. */
  readonly heightmap: Heightmap;
  /**
   * The park as it is today. A garden kept exactly as the baseline has it counts the plots the
   * site record gives; without a baseline every garden counts the beds that fit.
   */
  readonly baseline?: DesignDocument | undefined;
}

type Outcomes = Record<ConstraintKey, ConstraintOutcome>;

function inputIssues(input: MetricsInput): DocumentIssue[] {
  const pathIssues = input.document.paths.flatMap((path): DocumentIssue[] => {
    const catalogId = pathEntryId(path.surface);
    return input.catalog.has(catalogId)
      ? []
      : [{ kind: 'unknownPathSurface', elementId: path.id, catalogId }];
  });
  return [
    ...validateDesignAgainstCatalog(input.document, input.catalog),
    ...pathIssues,
    ...heightmapIssues(input.heightmap),
  ];
}

function measureSite(input: MetricsInput) {
  const { document, parameters, catalog } = input;
  const grid = gridOf(input.heightmap);
  const parcel = rasterizePolygon(grid, input.parcel.polygon);
  const footprints = designFootprints({
    document,
    catalog,
    grid,
    baselineAreas: input.baseline?.areas,
  });
  const zones = [...parameters.forbiddenZones, ...document.zones];
  const terraform = measureTerraform({
    grid,
    parcel,
    gradeDelta: document.gradeDelta,
    lockedTrees: lockedTrees(document, catalog),
    noGradeZones: zones,
    maxDeviationM: parameters.terraform.maxDeviationM,
    rootZonePerDbhCm: parameters.treeProtection.rootZonePerDbhCm,
  });
  return {
    grid,
    parcel,
    footprints,
    zones,
    terraform,
    graded: withGradeDelta(input.heightmap, document.gradeDelta),
    canopy: measureCanopy({ document, catalog, grid, parcel }),
    surfaces: measureSurfaces(footprints, parcel),
    costs: measureCosts({ footprints, volumes: terraform, rates: parameters.budget.earthworks }),
  };
}

type Site = ReturnType<typeof measureSite>;

function pathSlopesOf(site: Site, input: MetricsInput): PathSlopes[] {
  return measurePathSlopes(site.graded, input.document.paths, input.parameters.slopes);
}

function evaluate(site: Site, input: MetricsInput, pathSlopes: readonly PathSlopes[]): Outcomes {
  const { parameters } = input;
  const { footprints, terraform } = site;
  return {
    budget: budgetOutcome(site.costs.totalCad, parameters.budget.totalCad),
    canopy: canopyOutcome(site.canopy.percent, parameters.canopy.minPercent),
    impervious: imperviousOutcome(
      site.surfaces.imperviousPercent,
      parameters.impervious.maxPercent,
    ),
    requiredFeatures: featuresOutcome(featureShortfalls(footprints, parameters.requiredFeatures)),
    forbiddenZones: zonesOutcome(
      forbiddenZoneHits(footprints, site.zones),
      lockedOverlaps(footprints),
    ),
    slopes: slopesOutcome(
      pathSlopes,
      measureFootprintGrades(site.graded, footprints),
      parameters.slopes,
    ),
    counts: countsOutcome(countBreaches(categoryCounts(footprints), parameters.counts)),
    terraform: terraformOutcome(terraform, parameters.terraform),
    treeProtection: treeProtectionOutcome(terraform.rootZoneHits),
  };
}

function totalsOf(site: Site): MetricsTotals {
  const { terraform } = site;
  return {
    costCad: cad(site.costs.totalCad),
    canopyPercent: percent(site.canopy.percent),
    imperviousPercent: percent(site.surfaces.imperviousPercent),
    waterPercent: percent(site.surfaces.waterPercent),
    cut: cubicMetres(terraform.cut),
    fill: cubicMetres(terraform.fill),
    net: terraform.net,
    truckTrips: terraform.truckTrips,
    disturbedPercent: percent(terraform.disturbedPercent),
    gardenPlots: site.footprints
      .filter((footprint) => footprint.entry.category === 'garden')
      .reduce((total, footprint) => total + footprint.moduleCount, 0),
  };
}

/** How many subjects each gated meter has, so a meter with nothing to judge can hide. */
function subjectsOf(site: Site, input: MetricsInput): MeterSubjects {
  return {
    paths: input.document.paths.length,
    closedZones: site.zones.length,
    countRules: input.parameters.counts.length,
    trees: lockedTrees(input.document, input.catalog).length,
  };
}

/** Measures a design against the project parameters. Pure: the same input gives the same report. */
export function computeMetrics(input: MetricsInput): Result<MetricsReport, InvalidDocument> {
  const issues = inputIssues(input);
  if (issues.length > 0) return err(invalidDocument(issues));
  const site = measureSite(input);
  const pathSlopes = pathSlopesOf(site, input);
  return ok(
    buildReport({
      outcomes: evaluate(site, input, pathSlopes),
      severity: input.parameters.severity,
      totals: totalsOf(site),
      details: { pathSlopes },
      subjects: subjectsOf(site, input),
    }),
  );
}
