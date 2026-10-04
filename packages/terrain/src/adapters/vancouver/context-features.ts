import type { z } from 'zod';

import {
  CONTEXT_BIKEWAY_WIDTH_M,
  CONTEXT_SIDEWALK_WIDTH_M,
  CONTEXT_STREET_WIDTH_M,
  contextFeatureSchema,
  type ContextFeature,
  type ContextFeatureKind,
  type PlanePoint,
} from '@parkshape/core';

import type { LonLat } from '../../geojson.js';
import {
  boxContains,
  clipPolyline,
  nearestOnPolyline,
  roundedLine,
  roundedPoint,
  type LocalBox,
} from '../projection/context-box.js';
import type { SiteFrame } from '../projection/site-frame.js';
import type { GtfsFeed } from '../translink/gtfs-stops.js';

import {
  lineParts,
  parkingStalls,
  rightOfWayMetres,
  streetName,
  streetWidthM,
  type accessibleParkingRecordSchema,
  type bikewayRecordSchema,
  type LineFeature,
  type meterRecordSchema,
  type sidewalkRecordSchema,
  type StreetLine,
  type streetRecordSchema,
  type widthRecordSchema,
} from './context-records.js';
import { VANCOUVER_SOURCE } from './vancouver-records.js';

/** The source name sources.json lists for the TransLink feed. */
export const TRANSLINK_SOURCE = 'TransLink';
const GTFS_DATASET = 'gtfs-stops';
// A meter farther than this from every street centreline is not drawn.
const STALL_STREET_SEARCH_M = 30;
const ACTIVE = 'Active';

/** The rows fetched for one parcel, before they become features. */
export interface ContextRows {
  readonly streets: readonly z.output<typeof streetRecordSchema>[];
  readonly sidewalks: readonly z.output<typeof sidewalkRecordSchema>[];
  readonly bikeways: readonly z.output<typeof bikewayRecordSchema>[];
  readonly widths: readonly z.output<typeof widthRecordSchema>[];
  readonly meters: readonly z.output<typeof meterRecordSchema>[];
  readonly accessible: readonly z.output<typeof accessibleParkingRecordSchema>[];
  readonly stops: GtfsFeed;
}

interface Placement {
  readonly site: SiteFrame;
  readonly box: LocalBox;
}

interface LineSpec {
  readonly id: string;
  readonly kind: ContextFeatureKind;
  readonly name: string | undefined;
  readonly datasetId: string;
  readonly points: readonly PlanePoint[];
  readonly widthM: number;
}

function lineFeatures(spec: LineSpec, box: LocalBox): ContextFeature[] {
  return clipPolyline(spec.points, box)
    .map(roundedLine)
    .filter((piece) => piece.length > 1)
    .map((piece, index, pieces) =>
      contextFeatureSchema.parse({
        id: pieces.length === 1 ? spec.id : `${spec.id}-${String(index + 1)}`,
        kind: spec.kind,
        ...(spec.name === undefined ? {} : { name: spec.name }),
        source: { name: VANCOUVER_SOURCE, datasetId: spec.datasetId },
        geometry: { type: 'line', points: piece, widthM: spec.widthM },
      }),
    );
}

function localParts(feature: LineFeature | null, site: SiteFrame): PlanePoint[][] {
  return lineParts(feature).map((part) => part.map((position) => site.localPoint(position)));
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Ids that stay unique when two records share a name: the second gets -b, the third -c. */
function uniqueIds(): (base: string) => string {
  const seen = new Map<string, number>();
  const firstLetter = 'a'.charCodeAt(0);
  return (base) => {
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${String.fromCharCode(firstLetter + count)}`;
  };
}

function nearestWidth(
  points: readonly PlanePoint[],
  widths: readonly WidthPoint[],
): number | undefined {
  let best: { distance: number; widthM: number } | undefined;
  for (const width of widths) {
    const foot = nearestOnPolyline(width.position, points);
    if (foot === undefined || foot.distance > CONTEXT_STREET_WIDTH_M.searchM) continue;
    if (best === undefined || foot.distance < best.distance) {
      best = { distance: foot.distance, widthM: width.widthM };
    }
  }
  return best?.widthM;
}

interface WidthPoint {
  readonly position: PlanePoint;
  readonly widthM: number;
}

function widthPoints(rows: ContextRows, site: SiteFrame): WidthPoint[] {
  return rows.widths.flatMap((row) => {
    const widthM = rightOfWayMetres(row.width);
    const point = row.geo_point_2d;
    return widthM === undefined || point === null
      ? []
      : [{ position: site.localPoint([point.lon, point.lat]), widthM }];
  });
}

/** Every street centreline part, with its drawn width, before clipping. */
export function streetLines(
  rows: ContextRows,
  site: SiteFrame,
): (StreetLine & { name?: string; id: string })[] {
  const widths = widthPoints(rows, site);
  const idFor = uniqueIds();
  return rows.streets.flatMap((row) => {
    const name = streetName(row.hblock ?? '');
    const base = `street-${slug(row.hblock ?? 'unnamed')}`;
    return localParts(row.geom, site).map((points) => ({
      id: idFor(base),
      ...(name === undefined ? {} : { name }),
      points,
      widthM: streetWidthM(nearestWidth(points, widths)),
    }));
  });
}

function sidewalkFeatures(rows: ContextRows, { site, box }: Placement): ContextFeature[] {
  const idFor = uniqueIds();
  return rows.sidewalks.flatMap((row) =>
    localParts(row.geom, site).flatMap((points) =>
      lineFeatures(
        {
          id: idFor(`sidewalk-${slug(row.object_id)}`),
          kind: 'sidewalk',
          name: streetName(row.hundred_block ?? '', { side: 'drop' }),
          datasetId: 'sidewalk-condition-rating',
          points,
          widthM: CONTEXT_SIDEWALK_WIDTH_M,
        },
        box,
      ),
    ),
  );
}

function bikewayFeatures(rows: ContextRows, { site, box }: Placement): ContextFeature[] {
  const idFor = uniqueIds();
  return rows.bikeways
    .filter((row) => row.status === null || row.status === ACTIVE)
    .flatMap((row) =>
      localParts(row.geom, site).flatMap((points) =>
        lineFeatures(
          {
            id: idFor(`bikeway-${slug(row.object_id)}`),
            kind: 'bikeway',
            name: row.bike_route_name ?? undefined,
            datasetId: 'bikeways',
            points,
            widthM: CONTEXT_BIKEWAY_WIDTH_M,
          },
          box,
        ),
      ),
    );
}

interface MeterSpot {
  readonly id: string;
  readonly datasetId: string;
  readonly position: LonLat;
  readonly spaces: number;
}

function meterSpots(rows: ContextRows): MeterSpot[] {
  const meters = rows.meters.flatMap((row) =>
    row.geo_point_2d === null
      ? []
      : [
          {
            id: `parking-meter-${slug(row.meter_id)}`,
            datasetId: 'parking-meters',
            position: [row.geo_point_2d.lon, row.geo_point_2d.lat] as const,
            spaces: 1,
          },
        ],
  );
  const accessible = rows.accessible.flatMap((row) =>
    row.geo_point_2d === null
      ? []
      : [
          {
            id: `parking-accessible-${slug(row.object_id)}`,
            datasetId: 'disability-parking',
            position: [row.geo_point_2d.lon, row.geo_point_2d.lat] as const,
            spaces: Math.max(1, row.spaces ?? 1),
          },
        ],
  );
  return [...meters, ...accessible];
}

function nearestStreet(point: PlanePoint, streets: readonly StreetLine[]): StreetLine | undefined {
  let best: { distance: number; street: StreetLine } | undefined;
  for (const street of streets) {
    const foot = nearestOnPolyline(point, street.points);
    if (foot === undefined || foot.distance > STALL_STREET_SEARCH_M) continue;
    if (best === undefined || foot.distance < best.distance)
      best = { distance: foot.distance, street };
  }
  return best?.street;
}

function parkingFeatures(
  rows: ContextRows,
  streets: readonly StreetLine[],
  { site, box }: Placement,
) {
  return meterSpots(rows).flatMap((spot) => {
    const position = site.localPoint(spot.position);
    const street = nearestStreet(position, streets);
    if (street === undefined) return [];
    const stalls = parkingStalls(position, street, spot.spaces);
    return stalls
      .filter((ring) => ring.every((corner) => boxContains(box, corner)))
      .map((ring, index) =>
        contextFeatureSchema.parse({
          id: stalls.length === 1 ? spot.id : `${spot.id}-${String(index + 1)}`,
          kind: 'parking',
          source: { name: VANCOUVER_SOURCE, datasetId: spot.datasetId },
          geometry: { type: 'polygon', ring },
        }),
      );
  });
}

function busStopFeatures(feed: GtfsFeed, { site, box }: Placement): ContextFeature[] {
  return feed.stops.flatMap((stop) => {
    const position = roundedPoint(site.localPoint([stop.stop_lon, stop.stop_lat]));
    if (!boxContains(box, position)) return [];
    return [
      contextFeatureSchema.parse({
        id: `stop-${stop.stop_code === '' ? stop.stop_id : stop.stop_code}`,
        kind: 'busStop',
        name: stop.stop_name,
        source: { name: TRANSLINK_SOURCE, datasetId: GTFS_DATASET },
        geometry: { type: 'point', position },
      }),
    ];
  });
}

/** Every layer's features from the fetched rows, clipped to the box. Unsorted. */
export function contextFeatures(rows: ContextRows, placement: Placement): ContextFeature[] {
  const streets = streetLines(rows, placement.site);
  const streetFeatures = streets.flatMap((street) =>
    lineFeatures(
      {
        id: street.id,
        kind: 'street',
        name: street.name,
        datasetId: 'public-streets',
        points: street.points,
        widthM: street.widthM,
      },
      placement.box,
    ),
  );
  return [
    ...streetFeatures,
    ...sidewalkFeatures(rows, placement),
    ...busStopFeatures(rows.stops, placement),
    ...parkingFeatures(rows, streets, placement),
    ...bikewayFeatures(rows, placement),
  ];
}
