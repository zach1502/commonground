import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { GTFS_ZIP_URL, gtfsStopsZip, parseCsv, readGtfsStops } from './gtfs-stops.js';

const STOPS = [
  'stop_id,stop_code,stop_name,stop_desc,stop_lat,stop_lon,zone_id,stop_url,location_type,parent_station,wheelchair_boarding',
  '1,50001,"Westbound W Broadway @ Columbia St",,49.2633,-123.1093,BUS ZN,https://example.test/1,0,,1',
  '2,50002,"Stop with ""quotes"", and a comma",,49.2640,-123.1080,BUS ZN,,0,,1',
  '3,,Broadway-City Hall Station,,49.2630,-123.1150,,,1,,1',
  '4,59999,Far Away,,49.1799,-123.0914,BUS ZN,,0,,1',
].join('\r\n');
const FEED_INFO = [
  'feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version',
  'TransLink,https://www.translink.ca,en,20260907,20270103,26SEP_20261002',
].join('\n');

function zipOf(files: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])),
  );
}

describe('parseCsv', () => {
  it('reads quoted fields with commas and doubled quotes', () => {
    const rows = parseCsv('a,b\n"x, y","say ""hi"""\n');
    expect(rows).toEqual([{ a: 'x, y', b: 'say "hi"' }]);
  });

  it('skips a byte-order mark and blank lines', () => {
    expect(parseCsv('\uFEFFa\n1\n\n')).toEqual([{ a: '1' }]);
  });
});

describe('readGtfsStops', () => {
  it('reads stops.txt and the feed version from a GTFS zip', () => {
    const feed = readGtfsStops(
      zipOf({ 'stops.txt': STOPS, 'feed_info.txt': FEED_INFO, 'trips.txt': 'x' }),
    );
    expect(feed.ok && feed.value.feedVersion).toBe('26SEP_20261002');
    expect(feed.ok && feed.value.stops.map((stop) => stop.stop_name)).toEqual([
      'Westbound W Broadway @ Columbia St',
      'Stop with "quotes", and a comma',
      'Far Away',
    ]);
  });

  it('keeps only boarding points, not stations', () => {
    const feed = readGtfsStops(zipOf({ 'stops.txt': STOPS }));
    expect(feed.ok && feed.value.stops.some((stop) => stop.stop_id === '3')).toBe(false);
  });

  it('keeps only the stops inside the area when given one', () => {
    const area = { minLon: -123.12, minLat: 49.26, maxLon: -123.1, maxLat: 49.27 };
    const feed = readGtfsStops(zipOf({ 'stops.txt': STOPS }), area);
    expect(feed.ok && feed.value.stops.map((stop) => stop.stop_id)).toEqual(['1', '2']);
  });

  it('reports a zip with no stops.txt', () => {
    const feed = readGtfsStops(zipOf({ 'trips.txt': 'x' }));
    expect(feed.ok || feed.error.kind).toBe('invalidResponse');
  });

  it('reports bytes that are not a zip', () => {
    const feed = readGtfsStops(strToU8('not a zip'));
    expect(feed.ok || feed.error).toMatchObject({ kind: 'invalidResponse', url: GTFS_ZIP_URL });
  });
});

describe('gtfsStopsZip', () => {
  it('writes a zip that reads back to the same stops', () => {
    const feed = readGtfsStops(zipOf({ 'stops.txt': STOPS, 'feed_info.txt': FEED_INFO }));
    if (!feed.ok) throw new Error('fixture zip did not parse');
    expect(readGtfsStops(gtfsStopsZip(feed.value))).toEqual(feed);
  });
});
