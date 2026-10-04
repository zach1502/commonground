import { writeArrayBuffer } from 'geotiff';

import { lonLatBounds, type GeoJsonPolygon } from '../../../geojson.js';
import type { HttpFetch } from '../../../ports/http.js';
import { reprojectorFor } from '../../projection/local-frame.js';

export const CANADA_ATLAS_LAMBERT = 3979;
export const NO_DATA = -32767;
const MARGIN_PX = 4;

/** Elevation of the synthetic surface at a point in EPSG:3979: a tilted plane. */
export interface PlaneSurface {
  readonly x0: number;
  readonly y0: number;
  readonly baseM: number;
  readonly gradeX: number;
  readonly gradeY: number;
}

export function planeAt(plane: PlaneSurface, xy: readonly [number, number]): number {
  return plane.baseM + plane.gradeX * (xy[0] - plane.x0) + plane.gradeY * (xy[1] - plane.y0);
}

export interface SyntheticCog {
  readonly bytes: Uint8Array;
  readonly plane: PlaneSurface;
}

interface SyntheticCogOptions {
  readonly polygonWgs84: GeoJsonPolygon;
  readonly pixelSizeM: number;
  /** Pixel indexes (row * width + col) to fill with the no-data value. */
  readonly noDataPixels?: readonly number[];
  readonly epsg?: number;
}

/** A small float32 GeoTIFF in EPSG:3979 that covers the polygon with a few pixels to spare. */
export function makeSyntheticCog(options: SyntheticCogOptions): SyntheticCog {
  const { pixelSizeM } = options;
  const lambert = reprojectorFor(CANADA_ATLAS_LAMBERT);
  if (!lambert.ok) throw new Error('EPSG:3979 must be defined');
  const bounds = lonLatBounds(options.polygonWgs84);
  const corners = [
    lambert.value.fromWgs84([bounds.minLon, bounds.minLat]),
    lambert.value.fromWgs84([bounds.maxLon, bounds.minLat]),
    lambert.value.fromWgs84([bounds.minLon, bounds.maxLat]),
    lambert.value.fromWgs84([bounds.maxLon, bounds.maxLat]),
  ];
  const left =
    Math.floor(Math.min(...corners.map(([x]) => x)) / pixelSizeM - MARGIN_PX) * pixelSizeM;
  const top =
    Math.ceil(Math.max(...corners.map(([, y]) => y)) / pixelSizeM + MARGIN_PX) * pixelSizeM;
  const right = Math.max(...corners.map(([x]) => x)) + MARGIN_PX * pixelSizeM;
  const bottom = Math.min(...corners.map(([, y]) => y)) - MARGIN_PX * pixelSizeM;
  const width = Math.ceil((right - left) / pixelSizeM);
  const height = Math.ceil((top - bottom) / pixelSizeM);
  const plane: PlaneSurface = { x0: left, y0: top, baseM: 30, gradeX: 0.01, gradeY: -0.02 };
  const noData = new Set(options.noDataPixels ?? []);
  const values = Float32Array.from({ length: width * height }, (_, index) => {
    const col = index % width;
    const row = Math.floor(index / width);
    const xy = [left + (col + 0.5) * pixelSizeM, top - (row + 0.5) * pixelSizeM] as const;
    return noData.has(index) ? NO_DATA : planeAt(plane, xy);
  });
  const buffer = writeArrayBuffer(values, {
    width,
    height,
    BitsPerSample: [32],
    SampleFormat: [3],
    ModelPixelScale: [pixelSizeM, pixelSizeM, 0],
    ModelTiepoint: [0, 0, 0, left, top, 0],
    GTModelTypeGeoKey: 1,
    GTRasterTypeGeoKey: 1,
    ProjectedCSTypeGeoKey: options.epsg ?? CANADA_ATLAS_LAMBERT,
    GDAL_NODATA: String(NO_DATA),
  });
  return { bytes: new Uint8Array(buffer), plane };
}

export interface RangeServer {
  readonly fetch: HttpFetch;
  /** Every byte range requested, as [start, endInclusive]. */
  readonly ranges: [number, number][];
}

/**
 * A fetch that answers Range requests for one file with 206 responses, as S3 does, and
 * delegates other URLs to `fallback`.
 */
export function serveRanges(
  file: { url: string; bytes: Uint8Array },
  fallback: HttpFetch,
): RangeServer {
  const ranges: [number, number][] = [];
  const fetch: HttpFetch = (url, init) => {
    if (url !== file.url) return fallback(url, init);
    const header = new Headers(init?.headers).get('range') ?? '';
    const match = /bytes=(\d+)-(\d+)/.exec(header);
    const total = file.bytes.byteLength;
    const start = Number(match?.[1] ?? 0);
    const end = Math.min(Number(match?.[2] ?? total - 1), total - 1);
    ranges.push([start, end]);
    return Promise.resolve(
      new Response(file.bytes.slice(start, end + 1), {
        status: 206,
        headers: { 'content-range': `bytes ${String(start)}-${String(end)}/${String(total)}` },
      }),
    );
  };
  return { fetch, ranges };
}

/** A STAC search response with one item whose DTM asset points at `dtmUrl`. */
export function stacResponseFor(dtmUrl: string, epsg: number | undefined): unknown {
  const tiff = 'image/tiff; application=geotiff; profile=cloud-optimized';
  return {
    type: 'FeatureCollection',
    features: [
      {
        id: 'synthetic-item',
        properties: epsg === undefined ? {} : { 'proj:epsg': epsg },
        assets: {
          dsm: {
            href: dtmUrl.replace('dtm', 'dsm'),
            type: tiff,
            roles: ['data'],
            title: 'Digital Surface Model (COG)',
          },
          dtm: { href: dtmUrl, type: tiff, roles: ['data'], title: 'Digital Terrain Model (COG)' },
        },
      },
    ],
  };
}
