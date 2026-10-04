import { strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';

import { err, ok, type Result } from '@parkshape/core';

import type { HttpError, HttpFetch } from '../../ports/http.js';

/** TransLink's static GTFS feed for Metro Vancouver, refreshed each service change. */
export const GTFS_ZIP_URL = 'https://gtfs-static.translink.ca/gtfs/google_transit.zip';

/** Where fetch-context keeps the stops it recorded, under fixtures/<site>/raw. */
export const RECORDED_STOPS_FILE = 'translink-stops.json';

const STOPS_FILE = 'stops.txt';
const FEED_INFO_FILE = 'feed_info.txt';
// GTFS location_type: empty or 0 is a stop or platform where people board; 1 and up are stations.
const BOARDING_TYPES = new Set(['', '0']);
const BYTE_ORDER_MARK = '\uFEFF';

const stopRowSchema = z.object({
  stop_id: z.string().min(1),
  stop_code: z.string().default(''),
  stop_name: z.string().min(1),
  stop_lat: z.coerce.number(),
  stop_lon: z.coerce.number(),
  location_type: z.string().default(''),
});

export interface GtfsStop {
  readonly stop_id: string;
  readonly stop_code: string;
  readonly stop_name: string;
  readonly stop_lat: number;
  readonly stop_lon: number;
}

/** The boarding stops of one feed, with the version from feed_info.txt when it has one. */
export interface GtfsFeed {
  readonly feedVersion: string | null;
  readonly feedStartDate: string | null;
  readonly stops: readonly GtfsStop[];
}

/** raw/translink-stops.json: the feed's stops inside the recorded area, and where they came from. */
export const recordedStopsSchema = z.object({
  url: z.string(),
  feedVersion: z.string().nullable(),
  feedStartDate: z.string().nullable(),
  stops: z.array(
    z.object({
      stop_id: z.string(),
      stop_code: z.string(),
      stop_name: z.string(),
      stop_lat: z.number(),
      stop_lon: z.number(),
    }),
  ),
});

export interface LonLatArea {
  readonly minLon: number;
  readonly minLat: number;
  readonly maxLon: number;
  readonly maxLat: number;
}

function splitRow(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (quoted && char === '"' && line.charAt(index + 1) === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

/** RFC 4180 rows keyed by the header. GTFS names hold commas and quotes but never line breaks. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(BYTE_ORDER_MARK, '')
    .split(/\r?\n/)
    .filter((line) => line !== '');
  const [header, ...rows] = lines;
  if (header === undefined) return [];
  const names = splitRow(header);
  return rows.map((line) => {
    const fields = splitRow(line);
    return Object.fromEntries(names.map((name, index) => [name, fields[index] ?? '']));
  });
}

const inArea = (stop: GtfsStop, area: LonLatArea | undefined) =>
  area === undefined ||
  (stop.stop_lon >= area.minLon &&
    stop.stop_lon <= area.maxLon &&
    stop.stop_lat >= area.minLat &&
    stop.stop_lat <= area.maxLat);

function boardingStops(text: string, area: LonLatArea | undefined): GtfsStop[] {
  return parseCsv(text).flatMap((row) => {
    const parsed = stopRowSchema.safeParse(row);
    if (!parsed.success || !BOARDING_TYPES.has(parsed.data.location_type)) return [];
    const { stop_id, stop_code, stop_name, stop_lat, stop_lon } = parsed.data;
    const stop = { stop_id, stop_code, stop_name, stop_lat, stop_lon };
    return inArea(stop, area) ? [stop] : [];
  });
}

function unzipped(bytes: Uint8Array, url: string): Result<Record<string, Uint8Array>, HttpError> {
  try {
    const wanted = new Set([STOPS_FILE, FEED_INFO_FILE]);
    // The feed is about 16 MB; the filter inflates only the two small files this needs.
    return ok(unzipSync(bytes, { filter: (file) => wanted.has(file.name) }));
  } catch (cause) {
    const issues = cause instanceof Error ? cause.message : String(cause);
    return err({ kind: 'invalidResponse', url, issues: `not a GTFS zip: ${issues}` });
  }
}

/** The boarding stops in a GTFS zip, within the area when one is given. */
export function readGtfsStops(
  bytes: Uint8Array,
  area?: LonLatArea,
  url: string = GTFS_ZIP_URL,
): Result<GtfsFeed, HttpError> {
  const files = unzipped(bytes, url);
  if (!files.ok) return files;
  const stopsBytes = files.value[STOPS_FILE];
  if (stopsBytes === undefined) {
    return err({ kind: 'invalidResponse', url, issues: `the zip has no ${STOPS_FILE}` });
  }
  const decoder = new TextDecoder();
  const infoBytes = files.value[FEED_INFO_FILE];
  const [info] = infoBytes === undefined ? [] : parseCsv(decoder.decode(infoBytes));
  return ok({
    feedVersion: info?.feed_version ?? null,
    feedStartDate: info?.feed_start_date ?? null,
    stops: boardingStops(decoder.decode(stopsBytes), area),
  });
}

const csvField = (value: string | number) => {
  const text = String(value);
  return /[",]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** A GTFS zip holding just these stops, so tests replay a recorded feed without the 16 MB file. */
export function gtfsStopsZip(feed: GtfsFeed): Uint8Array {
  const columns = ['stop_id', 'stop_code', 'stop_name', 'stop_lat', 'stop_lon'] as const;
  const stops = [
    columns.join(','),
    ...feed.stops.map((stop) => columns.map((column) => csvField(stop[column])).join(',')),
  ].join('\n');
  const files: Record<string, Uint8Array> = { [STOPS_FILE]: strToU8(stops) };
  if (feed.feedVersion !== null || feed.feedStartDate !== null) {
    files[FEED_INFO_FILE] = strToU8(
      `feed_start_date,feed_version\n${feed.feedStartDate ?? ''},${feed.feedVersion ?? ''}`,
    );
  }
  return zipSync(files);
}

/** Downloads the feed and reads the stops in the area. Every failure is an HttpError. */
export async function fetchGtfsStops(
  fetch: HttpFetch,
  url: string,
  area: LonLatArea,
): Promise<Result<GtfsFeed, HttpError>> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    return err({
      kind: 'network',
      url,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
  if (!response.ok) return err({ kind: 'httpStatus', url, status: response.status });
  try {
    return readGtfsStops(new Uint8Array(await response.arrayBuffer()), area, url);
  } catch (cause) {
    return err({
      kind: 'network',
      url,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
