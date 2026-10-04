import { z } from 'zod';

import type { CatalogIndex } from './catalog/catalog.js';
import { computeMetrics } from './metrics/compute.js';
import { formatCad, formatGrade } from './metrics/format.js';
import { makeRampHeightmap, type Heightmap } from './metrics/heightmap.js';
import { parcelGrid } from './metrics/parcel-grid.js';
import type { MetricsReport } from './metrics/report.js';
import { err, ok, type Result } from './result.js';
import { designDocumentSchema } from './schema/design.js';
import { localPointSchema } from './schema/geometry.js';
import { defaultParameters } from './schema/parameters.js';
import { parcelSchema, type Parcel } from './schema/parcel.js';

const PARCEL_FILE = 'parcel.json';
const HEIGHTMAP_FILE = 'heightmap.json';
// A gentle slope so the demo report shows real slope numbers without failing every path.
const RAMP_GRADE_EAST = 0.015;
const RAMP_GRADE_NORTH = 0.01;

const heightmapFileSchema = z.strictObject({
  width: z.int().positive(),
  height: z.int().positive(),
  resolutionM: z.number().positive(),
  originLocal: localPointSchema,
  elevations: z.array(z.number()),
});

/** File access for the commands that measure a design file. Injected so tests need no disk. */
export interface DesignFileAccess {
  /** Throws when the file cannot be read. */
  readonly readText: (path: string) => string;
  /** Returns undefined when the file does not exist. */
  readonly readOptionalText: (path: string) => string | undefined;
  /** The path of a file with the given name in the same directory as path. */
  readonly siblingPath: (path: string, name: string) => string;
  readonly catalog: CatalogIndex;
}

export interface MeasuredDesign {
  readonly report: MetricsReport;
  /** Where the terrain came from: a heightmap file or the synthetic ramp. */
  readonly terrainSource: string;
}

export function parseJson(
  text: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
}

function parseFile<S extends z.ZodType>(path: string, text: string, schema: S) {
  const json = parseJson(text);
  if (!json.ok) return err([`${path} is not valid JSON: ${json.message}`]);
  const parsed = schema.safeParse(json.value);
  if (parsed.success) return ok(parsed.data);
  const issues = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
  return err([`${path} is not valid:`, ...issues]);
}

export function readFile(access: DesignFileAccess, path: string): Result<string, string[]> {
  try {
    return ok(access.readText(path));
  } catch (error) {
    return err([`Cannot read ${path}: ${String(error)}`]);
  }
}

interface Terrain {
  readonly heightmap: Heightmap;
  readonly source: string;
}

function syntheticRamp(parcel: Parcel): Terrain {
  const heightmap = makeRampHeightmap({
    ...parcelGrid(parcel),
    gradeX: RAMP_GRADE_EAST,
    gradeY: RAMP_GRADE_NORTH,
  });
  const grades = `${formatGrade(RAMP_GRADE_EAST)} east, ${formatGrade(RAMP_GRADE_NORTH)} north`;
  return { heightmap, source: `a synthetic ramp (${grades})` };
}

function loadTerrain(access: DesignFileAccess, path: string, parcel: Parcel) {
  const heightmapPath = access.siblingPath(path, HEIGHTMAP_FILE);
  const text = access.readOptionalText(heightmapPath);
  if (text === undefined) return ok(syntheticRamp(parcel));
  const parsed = parseFile(heightmapPath, text, heightmapFileSchema);
  if (!parsed.ok) return parsed;
  const heightmap = { ...parsed.value, elevations: Float32Array.from(parsed.value.elevations) };
  return ok({ heightmap, source: heightmapPath });
}

/**
 * Measures a design file with computeMetrics, the demo parameters, the parcel.json beside it
 * and heightmap.json when present. Both the validate and metrics commands report from this.
 */
export function measureDesignFile(
  access: DesignFileAccess,
  path: string,
): Result<MeasuredDesign, string[]> {
  const designText = readFile(access, path);
  if (!designText.ok) return designText;
  const document = parseFile(path, designText.value, designDocumentSchema);
  if (!document.ok) return document;
  const parcelPath = access.siblingPath(path, PARCEL_FILE);
  const parcelText = readFile(access, parcelPath);
  if (!parcelText.ok) return parcelText;
  const parcel = parseFile(parcelPath, parcelText.value, parcelSchema);
  if (!parcel.ok) return parcel;
  const terrain = loadTerrain(access, path, parcel.value);
  if (!terrain.ok) return terrain;
  const report = computeMetrics({
    document: document.value,
    parcel: parcel.value,
    heightmap: terrain.value.heightmap,
    parameters: defaultParameters(),
    catalog: access.catalog,
  });
  if (!report.ok) {
    const issues = report.error.issues.map((issue) => `  ${JSON.stringify(issue)}`);
    return err([`${path} cannot be measured:`, ...issues]);
  }
  return ok({ report: report.value, terrainSource: terrain.value.source });
}

/** The cost and plot lines, printed the same way by every command. */
export function costAndPlotLines(report: MetricsReport): string[] {
  return [
    `  Cost: ${formatCad(report.totals.costCad)} CAD`,
    `  Garden plots: ${String(report.totals.gardenPlots)}`,
  ];
}
