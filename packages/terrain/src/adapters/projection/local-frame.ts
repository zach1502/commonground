import proj4 from 'proj4';

import { err, ok, type PlanePoint, type Result } from '@parkshape/core';

import { lonLatBounds, outerRing, type GeoJsonPolygon, type LonLat } from '../../geojson.js';

const WGS84 = 'EPSG:4326';

/**
 * proj4 strings for the CRSs the elevation sources use. EPSG:3979 is NAD83(CSRS) / Canada
 * Atlas Lambert, which HRDEM and MRDEM report in their STAC items. NAD83(CSRS) and WGS84 differ
 * by about 1 m in Vancouver; that shift moves the whole grid, not the slopes inside it.
 */
const CRS_DEFINITIONS: Readonly<Record<number, string>> = {
  3979: '+proj=lcc +lat_0=49 +lon_0=-95 +lat_1=49 +lat_2=77 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  32610: '+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs',
};

export interface WgsOrigin {
  readonly lat: number;
  readonly lon: number;
}

/**
 * Metres east (x) and north (y) of the bounding box minimum of a parcel. The frame is a
 * transverse Mercator with scale 1 on a meridian through that corner, so a park-sized area has
 * ground distances within a few millimetres.
 */
export interface LocalFrame {
  readonly origin: WgsOrigin;
  toLocal(position: LonLat): PlanePoint;
  toWgs84(point: PlanePoint): LonLat;
  ringToLocal(polygon: GeoJsonPolygon): PlanePoint[];
}

function tmercAt(lat: number, lon: number): string {
  return `+proj=tmerc +lat_0=${String(lat)} +lon_0=${String(lon)} +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs`;
}

export function localFrameFor(polygon: GeoJsonPolygon): LocalFrame {
  const bounds = lonLatBounds(polygon);
  const converter = proj4(WGS84, tmercAt(bounds.minLat, bounds.minLon));
  const projected = outerRing(polygon).map((position) => converter.forward([...position]));
  const minX = Math.min(...projected.map(([x]) => x ?? 0));
  const minY = Math.min(...projected.map(([, y]) => y ?? 0));
  const toLocal = (position: LonLat): PlanePoint => {
    const [x = 0, y = 0] = converter.forward([...position]);
    return { x: x - minX, y: y - minY };
  };
  const toWgs84 = (point: PlanePoint): LonLat => {
    const [lon = 0, lat = 0] = converter.inverse([point.x + minX, point.y + minY]);
    return [lon, lat];
  };
  const [originLon, originLat] = toWgs84({ x: 0, y: 0 });
  return {
    origin: { lat: originLat, lon: originLon },
    toLocal,
    toWgs84,
    ringToLocal: (ringPolygon) => outerRing(ringPolygon).map(toLocal),
  };
}

/** Converts between WGS84 and a projected CRS, in that CRS's native units. */
export interface Reprojector {
  readonly crs: string;
  fromWgs84(position: LonLat): readonly [number, number];
  toWgs84(xy: readonly [number, number]): LonLat;
}

export function reprojectorFor(
  epsg: number,
): Result<Reprojector, { kind: 'unsupportedCrs'; crs: string }> {
  const crs = `EPSG:${String(epsg)}`;
  const definition = CRS_DEFINITIONS[epsg];
  if (definition === undefined) {
    return err({ kind: 'unsupportedCrs', crs });
  }
  const converter = proj4(WGS84, definition);
  return ok({
    crs,
    fromWgs84: (position) => {
      const [x = 0, y = 0] = converter.forward([...position]);
      return [x, y];
    },
    toWgs84: (xy) => {
      const [lon = 0, lat = 0] = converter.inverse([...xy]);
      return [lon, lat];
    },
  });
}
