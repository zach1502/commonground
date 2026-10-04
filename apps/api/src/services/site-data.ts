import {
  encodeHeightmap,
  geoJsonPolygonSchema,
  localFrameFor,
  writeStoredHeightmap,
  type ProposedFeature,
  type SiteFeatures,
  type TerrainResult,
} from '@parkshape/terrain';

import type {
  FeatureBody,
  SiteFeaturesBody,
  SiteFeaturesResultBody,
  TerrainBody,
  TerrainResultBody,
} from '../contracts/site.js';
import { terrainProviderSchema } from '../contracts/site.js';
import type { AppDeps } from '../deps.js';
import { siteDataError } from '../errors.js';

type SiteDeps = Pick<AppDeps, 'terrain' | 'siteFeatures' | 'blobStore' | 'newBlobId'>;

/** The provider that supplied the grid: the chain's winning attempt, or the provider itself. */
export function resolvedProvider(result: TerrainResult, providerName: string) {
  const winner = result.attempts?.find((attempt) => attempt.outcome === 'succeeded');
  const parsed = terrainProviderSchema.safeParse(winner?.provider ?? providerName);
  return parsed.success ? parsed.data : 'static';
}

/** Loads the elevation grid for an outline and stores it; returns the ref projects keep. */
export async function loadTerrain(deps: SiteDeps, body: TerrainBody): Promise<TerrainResultBody> {
  const polygonWgs84 = geoJsonPolygonSchema.parse(body.polygonWgs84);
  const result = await deps.terrain.getHeightmap({ polygonWgs84, resolutionM: body.resolutionM });
  if (!result.ok) throw siteDataError(result.error);
  const baseKey = `terrain/${deps.newBlobId()}`;
  const frameOrigin = localFrameFor(polygonWgs84).origin;
  await writeStoredHeightmap(
    deps.blobStore,
    baseKey,
    encodeHeightmap({ result: result.value, polygonWgs84, frameOrigin }),
  );
  const { heightmap, source, crs } = result.value;
  return {
    heightmapRef: `${baseKey}.bin`,
    provider: resolvedProvider(result.value, deps.terrain.name),
    source,
    crs,
    width: heightmap.width,
    height: heightmap.height,
    resolutionM: heightmap.resolutionM,
  };
}

function centreOf(points: readonly { readonly x: number; readonly y: number }[]) {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: total.x / points.length, y: total.y / points.length };
}

function featureFields(feature: ProposedFeature) {
  const { provenance, attributes } = feature;
  return {
    catalogId: feature.catalogId ?? null,
    name: attributes.name ?? null,
    dbhCm: attributes.dbhCm ?? null,
    plots: attributes.plots ?? null,
    suggestedLocked: feature.suggestedLocked,
    source: provenance.source,
    datasetId: provenance.datasetId,
    reviewOnly: provenance.reviewOnly ?? false,
  };
}

function presentFeature(
  feature: ProposedFeature,
  index: number,
  toWgs84: (point: { x: number; y: number }) => readonly [number, number],
): FeatureBody {
  const { provenance } = feature;
  const position = 'position' in feature ? { x: feature.position.x, y: feature.position.y } : null;
  const polygon = 'polygon' in feature ? feature.polygon.map(({ x, y }) => ({ x, y })) : null;
  const [lon, lat] = toWgs84(position ?? centreOf(polygon ?? []));
  return {
    id: `${provenance.datasetId}-${provenance.recordId ?? String(index)}`,
    kind: feature.kind,
    ...featureFields(feature),
    position,
    polygon,
    lonLat: [lon, lat],
  };
}

function presentSite(site: SiteFeatures, parkName: string | null): SiteFeaturesResultBody {
  const frame = localFrameFor(site.parcel.polygonWgs84);
  return {
    parkName,
    parcel: {
      polygonWgs84: {
        type: 'Polygon',
        coordinates: site.parcel.polygonWgs84.coordinates.map((ring) =>
          ring.map(([lon, lat]) => [lon, lat] as [number, number]),
        ),
      },
      polygonLocal: site.parcel.polygonLocal.map(({ x, y }) => ({ x, y })),
      origin: site.parcel.origin,
    },
    features: site.features.map((feature, index) =>
      presentFeature(feature, index, (point) => frame.toWgs84(point)),
    ),
  };
}

/** Finds the parcel by park name or drawn outline, with the features proposed for the baseline. */
export async function loadSiteFeatures(
  deps: SiteDeps,
  body: SiteFeaturesBody,
): Promise<SiteFeaturesResultBody> {
  const result = await deps.siteFeatures.getFeatures({
    ...(body.parkName === undefined ? {} : { parkName: body.parkName }),
    ...(body.polygonWgs84 === undefined
      ? {}
      : { polygonWgs84: geoJsonPolygonSchema.parse(body.polygonWgs84) }),
  });
  if (!result.ok) throw siteDataError(result.error);
  return presentSite(result.value, body.parkName ?? null);
}
