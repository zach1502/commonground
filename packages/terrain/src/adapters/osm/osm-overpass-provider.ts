import { z } from 'zod';

import { err, ok, polygonContains, type Result } from '@parkshape/core';

import { outerRing, type GeoJsonPolygon, type LonLat } from '../../geojson.js';
import type { HttpFetch } from '../../ports/http.js';
import type {
  FeatureKind,
  ProposedFeature,
  SiteFeatures,
  SiteFeaturesError,
  SiteFeaturesProvider,
  SiteFeaturesRequest,
} from '../../ports/site-features-provider.js';
import { requestJson } from '../http/request-json.js';
import { siteFrameFor, type SiteFrame } from '../projection/site-frame.js';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const QUERY_TIMEOUT_S = 25;
const USER_AGENT = 'CommonGround/0.1 (site feature review)';

// Tag filters in query order, with the feature kind each maps to.
const TAG_FILTERS: readonly { readonly filter: string; readonly kind: FeatureKind }[] = [
  { filter: '["landuse"="allotments"]', kind: 'garden' },
  { filter: '["leisure"="garden"]', kind: 'garden' },
  { filter: '["leisure"="pitch"]', kind: 'sportsField' },
  { filter: '["building"]', kind: 'building' },
];

const elementSchema = z.object({
  type: z.string(),
  id: z.number(),
  tags: z.record(z.string(), z.string()).optional(),
  geometry: z.array(z.object({ lat: z.number(), lon: z.number() })).optional(),
});
const overpassSchema = z.object({ elements: z.array(elementSchema) });
type OverpassElement = z.output<typeof elementSchema>;

export interface OsmOverpassOptions {
  readonly fetch: HttpFetch;
  readonly endpoint?: string;
}

/** Overpass QL for the mapped ways inside the polygon. poly: takes "lat lon" pairs. */
export function overpassQuery(polygon: GeoJsonPolygon): string {
  const poly = outerRing(polygon)
    .map(([lon, lat]) => `${String(lat)} ${String(lon)}`)
    .join(' ');
  const ways = TAG_FILTERS.map(({ filter }) => `way${filter}(poly:"${poly}");`).join('');
  return `[out:json][timeout:${String(QUERY_TIMEOUT_S)}];(${ways});out geom tags;`;
}

function kindOf(tags: Readonly<Record<string, string>>): FeatureKind | undefined {
  const matches = (filter: string) => {
    const [, key = '', value] = /\["([^"]+)"(?:="([^"]+)")?\]/.exec(filter) ?? [];
    return value === undefined ? key in tags : tags[key] === value;
  };
  return TAG_FILTERS.find(({ filter }) => matches(filter))?.kind;
}

function toFeature(element: OverpassElement, site: SiteFrame): ProposedFeature | undefined {
  const kind = element.tags === undefined ? undefined : kindOf(element.tags);
  const ring = (element.geometry ?? []).map(({ lat, lon }): LonLat => [lon, lat]);
  const polygon = element.type === 'way' ? site.localPolygon(ring) : undefined;
  if (kind === undefined || polygon === undefined) return undefined;
  const name = element.tags?.name;
  return {
    kind,
    polygon,
    attributes: name === undefined ? {} : { name },
    // Existing buildings are expensive to move; everything else is for a planner to decide.
    suggestedLocked: kind === 'building',
    provenance: {
      source: 'OpenStreetMap',
      datasetId: 'overpass',
      recordId: `${element.type}/${String(element.id)}`,
      licence: 'ODbL-1.0',
      reviewOnly: true,
    },
  };
}

function centreOf(feature: ProposedFeature) {
  const points = 'polygon' in feature ? feature.polygon : [feature.position];
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  };
}

/**
 * Footprints from OpenStreetMap. ODbL data is marked review only: a planner checks it before
 * the app shows it as fact, and the attribution names OpenStreetMap.
 */
export class OsmOverpassProvider implements SiteFeaturesProvider {
  readonly name = 'osm';

  constructor(private readonly options: OsmOverpassOptions) {}

  async getFeatures(
    request: SiteFeaturesRequest,
  ): Promise<Result<SiteFeatures, SiteFeaturesError>> {
    const polygonWgs84 = request.polygonWgs84;
    if (polygonWgs84 === undefined) {
      return err({ kind: 'invalidRequest', reason: 'Overpass lookups need a polygonWgs84' });
    }
    const response = await requestJson({
      fetch: this.options.fetch,
      url: this.options.endpoint ?? OVERPASS_URL,
      init: {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': USER_AGENT,
        },
        body: new URLSearchParams({ data: overpassQuery(polygonWgs84) }).toString(),
      },
      schema: overpassSchema,
    });
    if (!response.ok) return response;
    const site = siteFrameFor(polygonWgs84);
    const features = response.value.elements
      .map((element) => toFeature(element, site))
      .filter((feature): feature is ProposedFeature => feature !== undefined)
      .filter((feature) => polygonContains(site.parcel.polygonLocal, centreOf(feature)));
    return ok({ parcel: site.parcel, features });
  }
}
