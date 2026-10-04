import { z } from 'zod';

import {
  compareContextFeatures,
  err,
  ok,
  type Clock,
  type Result,
  type SiteContext,
} from '@parkshape/core';

import type { LonLat } from '../../geojson.js';
import type { HttpError, HttpFetch } from '../../ports/http.js';
import type {
  SiteContextError,
  SiteContextProvider,
  SiteContextRequest,
} from '../../ports/site-context-provider.js';
import { requestJson } from '../http/request-json.js';
import { boxRingWgs84, bufferedParcelBox } from '../projection/context-box.js';
import { siteFrameFor } from '../projection/site-frame.js';
import {
  fetchGtfsStops,
  GTFS_ZIP_URL,
  type GtfsFeed,
  type LonLatArea,
} from '../translink/gtfs-stops.js';

import { contextFeatures, type ContextRows } from './context-features.js';
import {
  accessibleParkingRecordSchema,
  bikewayRecordSchema,
  meterRecordSchema,
  sidewalkRecordSchema,
  streetRecordSchema,
  widthRecordSchema,
} from './context-records.js';
import { VANCOUVER_DATASETS_URL } from './vancouver-open-data-provider.js';

export interface VancouverContextOptions {
  readonly fetch: HttpFetch;
  /** Stamps recordedAt on each answer. */
  readonly clock: Clock;
  readonly baseUrl?: string;
  readonly gtfsUrl?: string;
  /** Gets the stops the feed gave inside the area, so fetch-context can record them. */
  readonly recordStops?: (feed: GtfsFeed & { readonly url: string }) => Promise<void>;
}

interface ExportQuery<S extends z.ZodType> {
  readonly dataset: string;
  readonly select: string;
  readonly where: 'lines' | 'points';
  readonly schema: S;
}

// Lines are kept when any part crosses the area, and clipped later; points must lie inside it.
const DATASETS = {
  streets: {
    dataset: 'public-streets',
    select: 'hblock,geom',
    where: 'lines',
    schema: streetRecordSchema,
  },
  sidewalks: {
    dataset: 'sidewalk-condition-rating',
    select: 'object_id,hundred_block,geom',
    where: 'lines',
    schema: sidewalkRecordSchema,
  },
  bikeways: {
    dataset: 'bikeways',
    select: 'object_id,street_name,bike_route_name,status,geom',
    where: 'lines',
    schema: bikewayRecordSchema,
  },
  widths: {
    dataset: 'right-of-way-widths',
    select: 'width,geo_point_2d',
    where: 'points',
    schema: widthRecordSchema,
  },
  meters: {
    dataset: 'parking-meters',
    select: 'meter_id,geo_point_2d',
    where: 'points',
    schema: meterRecordSchema,
  },
  accessible: {
    dataset: 'disability-parking',
    select: 'object_id,spaces,geo_point_2d',
    where: 'points',
    schema: accessibleParkingRecordSchema,
  },
} as const satisfies Record<string, ExportQuery<z.ZodType>>;

function wktRing(ring: readonly LonLat[]): string {
  return `POLYGON((${ring.map(([lon, lat]) => `${String(lon)} ${String(lat)}`).join(', ')}))`;
}

function areaOf(ring: readonly LonLat[]): LonLatArea {
  const lons = ring.map(([lon]) => lon);
  const lats = ring.map(([, lat]) => lat);
  return {
    minLon: Math.min(...lons),
    minLat: Math.min(...lats),
    maxLon: Math.max(...lons),
    maxLat: Math.max(...lats),
  };
}

/**
 * Streets, sidewalks, bikeways and parking from City of Vancouver open data, and bus stops from
 * the TransLink GTFS feed, around one parcel. Requests go one at a time and the first failure
 * ends the call, so offline mode costs one refused request.
 */
export class VancouverContextProvider implements SiteContextProvider {
  readonly name = 'vancouver';

  constructor(private readonly options: VancouverContextOptions) {}

  async getContext(request: SiteContextRequest): Promise<Result<SiteContext, SiteContextError>> {
    if (!Number.isFinite(request.bufferM) || request.bufferM < 0) {
      return err({
        kind: 'invalidRequest',
        reason: 'bufferM must be a finite number of 0 or more',
      });
    }
    const site = siteFrameFor(request.polygonWgs84);
    const box = bufferedParcelBox(site.parcel.polygonLocal, request.bufferM);
    const ring = boxRingWgs84(site.frame, box);
    const rows = await this.rows(ring);
    if (!rows.ok) return rows;
    const features = contextFeatures(rows.value, { site, box }).sort(compareContextFeatures);
    return ok({
      features,
      bufferM: request.bufferM,
      recordedAt: this.options.clock.now().toISOString(),
    });
  }

  private async rows(ring: readonly LonLat[]): Promise<Result<ContextRows, HttpError>> {
    const area = wktRing(ring);
    const streets = await this.exported(DATASETS.streets, area);
    if (!streets.ok) return streets;
    const sidewalks = await this.exported(DATASETS.sidewalks, area);
    if (!sidewalks.ok) return sidewalks;
    const bikeways = await this.exported(DATASETS.bikeways, area);
    if (!bikeways.ok) return bikeways;
    const widths = await this.exported(DATASETS.widths, area);
    if (!widths.ok) return widths;
    const meters = await this.exported(DATASETS.meters, area);
    if (!meters.ok) return meters;
    const accessible = await this.exported(DATASETS.accessible, area);
    if (!accessible.ok) return accessible;
    const stops = await this.stops(areaOf(ring));
    if (!stops.ok) return stops;
    return ok({
      streets: streets.value,
      sidewalks: sidewalks.value,
      bikeways: bikeways.value,
      widths: widths.value,
      meters: meters.value,
      accessible: accessible.value,
      stops: stops.value,
    });
  }

  /** One dataset's rows in the area through the export endpoint, which does not page. */
  private exported<S extends z.ZodType>(
    query: ExportQuery<S>,
    area: string,
  ): Promise<Result<z.output<S>[], HttpError>> {
    const where =
      query.where === 'lines'
        ? `intersects(geom, geom'${area}')`
        : `within(geo_point_2d, geom'${area}')`;
    const params = new URLSearchParams({ where, select: query.select });
    const base = this.options.baseUrl ?? VANCOUVER_DATASETS_URL;
    const url = `${base}/${query.dataset}/exports/json?${params.toString()}`;
    return requestJson({ fetch: this.options.fetch, url, schema: z.array(query.schema) });
  }

  private async stops(area: LonLatArea): Promise<Result<GtfsFeed, HttpError>> {
    const url = this.options.gtfsUrl ?? GTFS_ZIP_URL;
    const feed = await fetchGtfsStops(this.options.fetch, url, area);
    if (feed.ok && this.options.recordStops !== undefined) {
      await this.options.recordStops({ ...feed.value, url });
    }
    return feed;
  }
}
