import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import {
  catalogIndex,
  defaultParameters,
  designDocumentSchema,
  existingFeatureId,
  parcelSchema,
  plotsRecordedInside,
  type DesignDocument,
  type Heightmap,
  type Parcel,
  type ProjectParameters,
} from '@parkshape/core';

export const JONATHAN_ROGERS = 'Jonathan Rogers Park';
/** The recorded site data in packages/terrain; src and dist sit at the same depth. */
export const JONATHAN_ROGERS_FIXTURE_DIR = fileURLToPath(
  new URL('../../../terrain/fixtures/jonathan-rogers/', import.meta.url),
);
const PARCEL_ID = 'jonathan-rogers';
// The Park Board scope from shapeyourcity.ca/jonathan-rogers-park, read 2026-10-03 (docs/WHY.md).
const JONATHAN_ROGERS_BRIEF =
  'The Park Board plans a renewed inclusive playground, a fenced off-leash area for dogs and accessible paths across the east half of the park. Keep the community garden, the washroom and the open space.';
// The last day residents can design and vote, from the engagement timeline.
const JONATHAN_ROGERS_CLOSES_AT = '2026-10-31';
const HEIGHTMAP_BASE_KEY = 'terrain/jonathan-rogers';
export const HEIGHTMAP_REF = `${HEIGHTMAP_BASE_KEY}.bin`;
const FLOAT32_BYTES = 4;
const TRIANGLE_POINTS = 3;
// Trees whose species the catalog lacks draw as a small flowering tree, as in the planner wizard.
const FALLBACK_TREE = 'flowering-cherry';
const BUILDING_CATALOG = 'washroom-building';
const OUTLINE_CATALOG: Readonly<Record<string, string>> = {
  garden: 'community-garden',
  sportsField: 'lawn',
};

const pointSchema = z.object({ x: z.number(), y: z.number() });
type Point = z.output<typeof pointSchema>;

const featureSchema = z.object({
  kind: z.string(),
  catalogId: z.string().nullable().optional(),
  position: pointSchema.nullable().optional(),
  polygon: z.array(pointSchema).nullable().optional(),
  attributes: z
    .object({ dbhCm: z.number().nullable().optional(), plots: z.number().int().optional() })
    .loose(),
  suggestedLocked: z.boolean(),
  provenance: z.object({ datasetId: z.string(), recordId: z.string() }).loose(),
});

const featuresFileSchema = z.object({
  parkName: z.string(),
  parcel: z.object({
    polygonLocal: z.array(pointSchema).min(TRIANGLE_POINTS),
    origin: z.object({ lat: z.number(), lon: z.number() }),
  }),
  features: z.array(featureSchema),
});

const headerSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  resolutionM: z.number().positive(),
  originLocal: pointSchema,
});

type SiteFeature = z.output<typeof featureSchema>;
type PlotRecords = Parameters<typeof plotsRecordedInside>[1];

/** A file the seed stores through the blob store before the project is created. */
export interface SeedBlob {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/** Everything the seed needs to create the demo project from the real site data. */
export interface SeedSite {
  readonly name: string;
  readonly parcel: Parcel;
  readonly parameters: ProjectParameters;
  readonly baseline: DesignDocument;
  readonly heightmap: Heightmap;
  readonly heightmapRef: string;
  readonly blobs: readonly SeedBlob[];
  /** The last day of design and voting, as an ISO date. */
  readonly closesAt: string;
}

function centreOf(points: readonly { x: number; y: number }[]) {
  const sum = points.reduce((total, p) => ({ x: total.x + p.x, y: total.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function treeItem(feature: SiteFeature, id: string) {
  const known = feature.catalogId == null ? undefined : catalogIndex.get(feature.catalogId);
  const dbh = feature.attributes.dbhCm;
  return {
    id,
    catalogId: known?.id ?? FALLBACK_TREE,
    position: feature.position,
    rotationDeg: 0,
    locked: feature.suggestedLocked,
    ...(dbh == null ? {} : { dbhCm: dbh }),
  };
}

/** Garden records give the plot count at a point; the outline around them takes it. */
function gardenRecords(features: readonly SiteFeature[]): PlotRecords {
  return features.flatMap((feature) =>
    feature.kind === 'garden' && feature.position != null
      ? [{ position: feature.position, plots: feature.attributes.plots }]
      : [],
  );
}

function recordedPlots(feature: SiteFeature, polygon: readonly Point[], records: PlotRecords) {
  if (feature.kind !== 'garden') return {};
  const plots = feature.attributes.plots ?? plotsRecordedInside(polygon, records);
  return plots === undefined ? {} : { recordedPlots: plots };
}

function outlineParts(feature: SiteFeature, id: string, records: PlotRecords) {
  const polygon = feature.polygon ?? [];
  const areaCatalog = OUTLINE_CATALOG[feature.kind];
  if (polygon.length === 0) return {};
  if (areaCatalog !== undefined) {
    const locked = feature.suggestedLocked;
    const plots = recordedPlots(feature, polygon, records);
    return { area: { id, catalogId: areaCatalog, polygon, locked, existing: true, ...plots } };
  }
  if (feature.kind !== 'building') return {};
  const position = centreOf(polygon);
  return {
    item: { id, catalogId: BUILDING_CATALOG, position, rotationDeg: 0, locked: true },
  };
}

/** The park as it is today: measured trees, the field house as the washroom and the outlines. */
export function baselineFromFeatures(features: readonly SiteFeature[]): DesignDocument {
  const items: object[] = [];
  const areas: object[] = [];
  const records = gardenRecords(features);
  for (const feature of features) {
    const id = existingFeatureId(`${feature.provenance.datasetId}-${feature.provenance.recordId}`);
    if (feature.kind === 'tree' && feature.position != null) {
      items.push(treeItem(feature, id));
      continue;
    }
    const parts = outlineParts(feature, id, records);
    if (parts.item !== undefined) items.push(parts.item);
    if (parts.area !== undefined) areas.push(parts.area);
  }
  return designDocumentSchema.parse({
    version: 1,
    items,
    areas,
    paths: [],
    gradeDelta: { cells: [] },
    zones: [],
  });
}

function decodeElevations(bytes: Uint8Array, count: number): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Float32Array.from({ length: count }, (_, index) =>
    view.getFloat32(index * FLOAT32_BYTES, true),
  );
}

/**
 * Reads the recorded Jonathan Rogers fixture (packages/terrain/fixtures/jonathan-rogers). The
 * heightmap files are already in the stored-heightmap format, so they are stored unchanged.
 */
export function loadJonathanRogersSite(fixtureDir: string = JONATHAN_ROGERS_FIXTURE_DIR): SeedSite {
  const features = featuresFileSchema.parse(
    JSON.parse(readFileSync(join(fixtureDir, 'features.json'), 'utf8')),
  );
  const headerBytes = new Uint8Array(readFileSync(join(fixtureDir, 'heightmap.json')));
  const header = headerSchema.parse(JSON.parse(new TextDecoder().decode(headerBytes)));
  const dataBytes = new Uint8Array(readFileSync(join(fixtureDir, 'heightmap.bin')));
  const heightmap: Heightmap = {
    ...header,
    elevations: decodeElevations(dataBytes, header.width * header.height),
  };
  return {
    name: features.parkName,
    parcel: parcelSchema.parse({
      id: PARCEL_ID,
      name: features.parkName,
      origin: features.parcel.origin,
      polygon: features.parcel.polygonLocal,
    }),
    parameters: { ...defaultParameters(), brief: JONATHAN_ROGERS_BRIEF },
    baseline: baselineFromFeatures(features.features),
    closesAt: JONATHAN_ROGERS_CLOSES_AT,
    heightmap,
    heightmapRef: HEIGHTMAP_REF,
    blobs: [
      { key: `${HEIGHTMAP_BASE_KEY}.json`, bytes: headerBytes, contentType: 'application/json' },
      { key: HEIGHTMAP_REF, bytes: dataBytes, contentType: 'application/octet-stream' },
    ],
  };
}
