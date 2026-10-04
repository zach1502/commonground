import type { HttpFetch } from '../../ports/http.js';
import {
  GTFS_ZIP_URL,
  gtfsStopsZip,
  RECORDED_STOPS_FILE,
  recordedStopsSchema,
} from '../translink/gtfs-stops.js';

const DATASET_PATH = /\/catalog\/datasets\/([\w-]+)\/(?:records|exports\/json)/;
const JSON_INDENT = 2;
const NOT_FOUND = 404;

function stacCollection(init: RequestInit | undefined): string | undefined {
  if (typeof init?.body !== 'string') return undefined;
  const body = JSON.parse(init.body) as { collections?: unknown };
  const collections: unknown[] = Array.isArray(body.collections) ? body.collections : [];
  const [collection] = collections;
  return typeof collection === 'string' ? collection : undefined;
}

/**
 * The file name a recorded response is kept under in fixtures/<site>/raw. COG range reads are
 * binary and not recorded; tests serve a synthetic COG instead.
 */
export function recordedName(url: string, init?: RequestInit): string | undefined {
  const dataset = DATASET_PATH.exec(url)?.[1];
  if (dataset !== undefined) return `vancouver-${dataset}.json`;
  if (url.includes('overpass')) return 'overpass.json';
  if (url === GTFS_ZIP_URL) return RECORDED_STOPS_FILE;
  const collection = url.endsWith('/search') ? stacCollection(init) : undefined;
  return collection === undefined ? undefined : `stac-${collection}.json`;
}

function replayed(name: string, text: string): Response {
  if (name !== RECORDED_STOPS_FILE) {
    return new Response(text, { headers: { 'content-type': 'application/json' } });
  }
  // The feed is a 16 MB zip, so the recording keeps the stops it used and replay zips them again.
  const zip = gtfsStopsZip(recordedStopsSchema.parse(JSON.parse(text)));
  return new Response(new Blob([new Uint8Array(zip)]), {
    headers: { 'content-type': 'application/zip' },
  });
}

/** A fetch that answers from recorded files, so adapter tests run offline. */
export function replayFetch(read: (name: string) => Promise<string | undefined>): HttpFetch {
  return async (url, init) => {
    const name = recordedName(url, init);
    const text = name === undefined ? undefined : await read(name);
    return name === undefined || text === undefined
      ? new Response('no recording', { status: NOT_FOUND })
      : replayed(name, text);
  };
}

/**
 * A fetch that saves each named JSON response through `save`, pretty-printed, as it passes. The
 * GTFS zip is not JSON; fetch-context records the stops it used instead.
 */
export function recordingFetch(
  fetch: HttpFetch,
  save: (name: string, text: string) => Promise<void>,
): HttpFetch {
  return async (url, init) => {
    const response = await fetch(url, init);
    const name = recordedName(url, init);
    if (name === undefined || name === RECORDED_STOPS_FILE || !response.ok) return response;
    const text = await response.text();
    await save(name, `${JSON.stringify(JSON.parse(text), null, JSON_INDENT)}\n`);
    return new Response(text, { status: response.status, headers: response.headers });
  };
}
