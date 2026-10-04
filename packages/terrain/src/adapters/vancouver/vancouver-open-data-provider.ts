import { z } from 'zod';

import { err, ok, polygonContains, type Result } from '@parkshape/core';

import { geoJsonPolygonSchema, outerRing, type GeoJsonPolygon } from '../../geojson.js';
import type { HttpFetch } from '../../ports/http.js';
import type {
  ProposedFeature,
  SiteFeatures,
  SiteFeaturesError,
  SiteFeaturesProvider,
  SiteFeaturesRequest,
} from '../../ports/site-features-provider.js';
import { requestJson } from '../http/request-json.js';
import { siteFrameFor, type SiteFrame } from '../projection/site-frame.js';

import {
  gardenFeature,
  gardenRecordSchema,
  parkOuterRing,
  parkRecordSchema,
  specialFeature,
  specialFeatureRecordSchema,
  treeFeature,
  treeRecordSchema,
} from './vancouver-records.js';

export const VANCOUVER_DATASETS_URL =
  'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets';
// Opendatasoft v2.1 returns at most 100 records per page.
const PAGE_SIZE = 100;
// Paging stops here even if total_count says more, so a bad count cannot loop forever.
const MAX_RECORDS = 10_000;
const SAFE_NAME = /^[\w .'&()-]+$/;

export interface VancouverOpenDataOptions {
  readonly fetch: HttpFetch;
  readonly baseUrl?: string;
}

interface DatasetQuery<S extends z.ZodType> {
  readonly dataset: string;
  readonly where: string;
  readonly select: string;
  readonly schema: S;
}

function wktPolygon(polygon: GeoJsonPolygon): string {
  const ring = outerRing(polygon).map(([lon, lat]) => `${String(lon)} ${String(lat)}`);
  return `POLYGON((${ring.join(', ')}))`;
}

/** Street trees, gardens and special features from the City of Vancouver open data portal. */
export class VancouverOpenDataProvider implements SiteFeaturesProvider {
  readonly name = 'vancouver';

  constructor(private readonly options: VancouverOpenDataOptions) {}

  async getFeatures(
    request: SiteFeaturesRequest,
  ): Promise<Result<SiteFeatures, SiteFeaturesError>> {
    const parcelPolygon = await this.parcelPolygon(request);
    if (!parcelPolygon.ok) return parcelPolygon;
    const site = siteFrameFor(parcelPolygon.value);
    const inside = `within(geo_point_2d, geom'${wktPolygon(parcelPolygon.value)}')`;
    const trees = await this.records({
      dataset: 'public-trees',
      where: inside,
      select: 'asset_id,common_name,genus_name,species_name,diameter_cm,height_m,geo_point_2d',
      schema: treeRecordSchema,
    });
    if (!trees.ok) return trees;
    const gardens = await this.records({
      dataset: 'community-gardens-and-food-trees',
      where: inside,
      select: 'mapid,name,number_of_plots,geo_point_2d',
      schema: gardenRecordSchema,
    });
    if (!gardens.ok) return gardens;
    const special =
      request.parkName === undefined ? ok([]) : await this.specialFeatures(request.parkName);
    if (!special.ok) return special;
    const features = [
      ...trees.value.map((row) => treeFeature(row, site)),
      ...gardens.value.map((row) => gardenFeature(row, site)),
      ...special.value.map((row) => specialFeature(row, site)),
    ].filter(
      (feature): feature is ProposedFeature => feature !== undefined && isInside(site, feature),
    );
    return ok({ parcel: site.parcel, features });
  }

  private async parcelPolygon(
    request: SiteFeaturesRequest,
  ): Promise<Result<GeoJsonPolygon, SiteFeaturesError>> {
    const { parkName, polygonWgs84 } = request;
    if (parkName === undefined) {
      return polygonWgs84 === undefined
        ? err({ kind: 'invalidRequest', reason: 'give a parkName or a polygonWgs84' })
        : ok(polygonWgs84);
    }
    if (!SAFE_NAME.test(parkName)) {
      return err({
        kind: 'invalidRequest',
        reason: 'parkName has characters the query cannot quote',
      });
    }
    const parks = await this.records({
      dataset: 'parks-polygon-representation',
      where: `park_name="${parkName}"`,
      select: 'park_name,geom',
      schema: parkRecordSchema,
    });
    if (!parks.ok) return parks;
    const [park] = parks.value;
    const polygon = geoJsonPolygonSchema.safeParse({
      type: 'Polygon',
      coordinates: park === undefined ? [] : [parkOuterRing(park)],
    });
    return polygon.success ? ok(polygon.data) : err({ kind: 'parkNotFound', parkName });
  }

  private specialFeatures(parkName: string) {
    return this.records({
      dataset: 'parks-special-features',
      where: `name="${parkName}"`,
      select: 'parkid,name,specialfeature',
      schema: specialFeatureRecordSchema,
    });
  }

  private async records<S extends z.ZodType>(
    query: DatasetQuery<S>,
  ): Promise<Result<z.output<S>[], SiteFeaturesError>> {
    const schema = z.object({ total_count: z.number(), results: z.array(query.schema) });
    const rows: z.output<S>[] = [];
    for (let offset = 0; offset < MAX_RECORDS; offset += PAGE_SIZE) {
      const params = new URLSearchParams({
        where: query.where,
        select: query.select,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const base = this.options.baseUrl ?? VANCOUVER_DATASETS_URL;
      const url = `${base}/${query.dataset}/records?${params.toString()}`;
      const page = await requestJson({ fetch: this.options.fetch, url, schema });
      if (!page.ok) return page;
      rows.push(...page.value.results);
      if (page.value.results.length < PAGE_SIZE || rows.length >= page.value.total_count) break;
    }
    return ok(rows);
  }
}

function isInside(site: SiteFrame, feature: ProposedFeature): boolean {
  return 'position' in feature && polygonContains(site.parcel.polygonLocal, feature.position);
}
