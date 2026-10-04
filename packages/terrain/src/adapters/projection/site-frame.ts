import { metres, polygonSchema, type LocalPoint, type Polygon } from '@parkshape/core';

import { outerRing, type GeoJsonPolygon, type LonLat } from '../../geojson.js';
import type { SiteParcel } from '../../ports/site-features-provider.js';

import { localFrameFor, type LocalFrame } from './local-frame.js';

/** A parcel and the helpers that place source features in its local frame. */
export interface SiteFrame {
  readonly parcel: SiteParcel;
  readonly frame: LocalFrame;
  localPoint(position: LonLat): LocalPoint;
  /** The ring in local metres without its closing position, or undefined below 3 points. */
  localPolygon(ring: readonly LonLat[]): Polygon | undefined;
  /** Mean of the parcel vertices, for features the source does not locate. */
  centre(): LocalPoint;
}

function openRing(ring: readonly LonLat[]): readonly LonLat[] {
  const first = ring[0];
  const last = ring.at(-1);
  const closed = first !== undefined && first[0] === last?.[0] && first[1] === last[1];
  return closed && ring.length > 1 ? ring.slice(0, -1) : ring;
}

export function siteFrameFor(polygonWgs84: GeoJsonPolygon): SiteFrame {
  const frame = localFrameFor(polygonWgs84);
  const localPoint = (position: LonLat): LocalPoint => {
    const { x, y } = frame.toLocal(position);
    return { x: metres(x), y: metres(y) };
  };
  const localPolygon = (ring: readonly LonLat[]): Polygon | undefined => {
    const parsed = polygonSchema.safeParse(openRing(ring).map(localPoint));
    return parsed.success ? parsed.data : undefined;
  };
  const polygonLocal = localPolygon(outerRing(polygonWgs84));
  if (polygonLocal === undefined) {
    // geoJsonPolygonSchema requires 4 positions per ring, so this means an unparsed polygon.
    throw new TypeError('parcel polygon needs at least 3 distinct positions');
  }
  const centre = (): LocalPoint => ({
    x: metres(polygonLocal.reduce((total, point) => total + point.x, 0) / polygonLocal.length),
    y: metres(polygonLocal.reduce((total, point) => total + point.y, 0) / polygonLocal.length),
  });
  return {
    parcel: { polygonWgs84, polygonLocal, origin: frame.origin },
    frame,
    localPoint,
    localPolygon,
    centre,
  };
}
