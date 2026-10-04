import { catalogIndex, designDocumentSchema, type Heightmap } from '@parkshape/core';

import { toParkDocument } from '../src/editor/document-adapter.js';
import type { CatalogItem, GroundPoint, ParkDocument } from '../src/index.js';
import { viewerCatalog } from '../src/thumbnail/viewer-input.js';

import { rampHeightmap, rampParcel, sampleCatalog, sampleDocument } from './sample-park.js';

export type DevPark = 'ramp' | 'seed' | 'baseline';
export type DevTier = 'desktop' | 'phone';

/** What the dev page draws: a heightmap, a design on it and the catalog the design names. */
export interface DevScene {
  readonly heightmap: Heightmap;
  readonly document: ParkDocument;
  readonly catalog: readonly CatalogItem[];
  /** The parcel boundary in the scene's ground frame, which the walk stays inside. */
  readonly parcel: readonly GroundPoint[];
}

// Fetched by URL through Vite, so the dev page adds no import edge to @parkshape/terrain.
// Vite rewrites these only when each path is one string literal.
const HEIGHTMAP_BIN = new URL(
  '../../terrain/fixtures/jonathan-rogers/heightmap.bin',
  import.meta.url,
);
const HEIGHTMAP_HEADER = new URL(
  '../../terrain/fixtures/jonathan-rogers/heightmap.json',
  import.meta.url,
);
// One showcase design from the seed, written out by the db seed plan.
const SEED_DESIGN = new URL('./fixtures/seed-design.generated.json', import.meta.url);
// The park as it is today, the seed's baseline, written out by the db seed's site loader.
const BASELINE_DESIGN = new URL('./fixtures/baseline.generated.json', import.meta.url);

interface HeightmapHeader {
  readonly width: number;
  readonly height: number;
  readonly resolutionM: number;
  readonly originLocal: { readonly x: number; readonly y: number };
}

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

export function parkFrom(search: URLSearchParams): DevPark {
  return pick(search.get('park'), ['ramp', 'seed', 'baseline'], 'ramp');
}

/** The tier the URL forces, or undefined to let the viewer probe the device. */
export function tierFrom(search: URLSearchParams): DevTier | undefined {
  const value = search.get('tier');
  return value === 'desktop' || value === 'phone' ? value : undefined;
}

async function fetchJson(url: URL): Promise<unknown> {
  const response = await fetch(url);
  return response.json();
}

async function seedHeightmap(): Promise<Heightmap> {
  const header = (await fetchJson(HEIGHTMAP_HEADER)) as HeightmapHeader;
  const bytes = await (await fetch(HEIGHTMAP_BIN)).arrayBuffer();
  return {
    width: header.width,
    height: header.height,
    resolutionM: header.resolutionM,
    originLocal: header.originLocal,
    elevations: new Float32Array(bytes),
  };
}

async function seedScene(designUrl: URL): Promise<DevScene> {
  const [heightmap, design] = await Promise.all([seedHeightmap(), fetchJson(designUrl)]);
  const { document, parcel } = design as {
    readonly document: unknown;
    readonly parcel: { readonly polygon: readonly { readonly x: number; readonly y: number }[] };
  };
  return {
    heightmap,
    document: toParkDocument(designDocumentSchema.parse(document), catalogIndex),
    catalog: viewerCatalog,
    // Core's local y (north) is the scene's z.
    parcel: parcel.polygon.map((point) => ({ x: point.x, z: point.y })),
  };
}

/** Loads the scene for a park; the ramp is built in memory, the seed comes from the fixtures. */
export async function loadDevScene(park: DevPark): Promise<DevScene> {
  if (park === 'seed') return seedScene(SEED_DESIGN);
  if (park === 'baseline') return seedScene(BASELINE_DESIGN);
  return {
    heightmap: rampHeightmap,
    document: sampleDocument,
    catalog: sampleCatalog,
    parcel: rampParcel,
  };
}
