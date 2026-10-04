import { z } from 'zod';

import { CONTEXT_STREET_WIDTH_M, type PlanePoint } from '@parkshape/core';

import type { LonLat } from '../../geojson.js';
import { nearestOnPolyline } from '../projection/context-box.js';

const METRES_PER_FOOT = 0.3048;
/**
 * right-of-way-widths mixes units: lanes and newer streets read 8 to 30 in metres, older blocks
 * 66 or 86 in feet. No Vancouver right-of-way is over 40 m, so a larger value is feet.
 */
const LARGEST_WIDTH_IN_METRES = 40;
// A parking stall, in metres: one car length along the curb and one car width out from it.
const STALL_LENGTH_M = 6;
const STALL_DEPTH_M = 2.4;
const HALF = 0.5;
const CENTIMETRES_PER_METRE = 100;
// Drawn widths are kept to the decimetre; the source widths are no finer.
const DECIMETRES_PER_METRE = 10;

const positionSchema = z
  .tuple([z.number(), z.number()], z.number())
  .transform((position): LonLat => [position[0], position[1]]);
const lineGeometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('LineString'), coordinates: z.array(positionSchema) }),
  z.object({ type: z.literal('MultiLineString'), coordinates: z.array(z.array(positionSchema)) }),
]);
const lineFeatureSchema = z.object({ geometry: lineGeometrySchema });
const pointSchema = z.object({ lon: z.number(), lat: z.number() });

export const streetRecordSchema = z.object({
  hblock: z.string().nullable(),
  geom: lineFeatureSchema.nullable(),
});
export const sidewalkRecordSchema = z.object({
  object_id: z.string(),
  hundred_block: z.string().nullable(),
  geom: lineFeatureSchema.nullable(),
});
export const bikewayRecordSchema = z.object({
  object_id: z.union([z.string(), z.number()]).transform(String),
  street_name: z.string().nullable(),
  bike_route_name: z.string().nullable(),
  status: z.string().nullable(),
  geom: lineFeatureSchema.nullable(),
});
export const widthRecordSchema = z.object({
  width: z.string().nullable(),
  geo_point_2d: pointSchema.nullable(),
});
export const meterRecordSchema = z.object({
  meter_id: z.string(),
  geo_point_2d: pointSchema.nullable(),
});
export const accessibleParkingRecordSchema = z.object({
  object_id: z.union([z.string(), z.number()]).transform(String),
  spaces: z.number().int().nullable(),
  geo_point_2d: pointSchema.nullable(),
});

export type LineFeature = z.output<typeof lineFeatureSchema>;

/** Each part of a line or multiline record, in WGS84. */
export function lineParts(feature: LineFeature | null): LonLat[][] {
  if (feature === null) return [];
  const { geometry } = feature;
  return geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
}

const SUFFIXES: Readonly<Record<string, string>> = {
  AV: 'Ave',
  AVE: 'Ave',
  ST: 'St',
  DR: 'Dr',
  RD: 'Rd',
  BLVD: 'Blvd',
  PL: 'Pl',
  CRES: 'Cres',
  HWY: 'Hwy',
};
const DIRECTIONS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
const ORDINAL = /^(\d+)(ST|ND|RD|TH)$/;
const BLOCK_NUMBER = /^\d+$/;

function signWord(word: string): string {
  const ordinal = ORDINAL.exec(word);
  if (ordinal !== null) return `${ordinal[1] ?? ''}${(ordinal[2] ?? '').toLowerCase()}`;
  if (DIRECTIONS.has(word)) return word;
  const suffix = SUFFIXES[word];
  if (suffix !== undefined) return suffix;
  return word.charAt(0) + word.slice(1).toLowerCase();
}

export interface StreetNameOptions {
  /** Sidewalk records end in the side of the street, such as "2100 QUEBEC ST E". */
  readonly side?: 'keep' | 'drop';
}

/** "100 W 7TH AV" becomes "W 7th Ave": no block number, and the case street signs use. */
export function streetName(
  hundredBlock: string,
  options: StreetNameOptions = {},
): string | undefined {
  const words = hundredBlock
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter((word) => word !== '');
  const [first] = words;
  if (first !== undefined && BLOCK_NUMBER.test(first)) words.shift();
  const last = words.at(-1);
  if (options.side === 'drop' && words.length > 1 && last !== undefined && DIRECTIONS.has(last)) {
    words.pop();
  }
  return words.length === 0 ? undefined : words.map(signWord).join(' ');
}

/** A right-of-way-widths value in metres, or undefined when it is not a number. */
export function rightOfWayMetres(width: string | null): number | undefined {
  const value = Number(width);
  if (width === null || !Number.isFinite(value) || value <= 0) return undefined;
  return value > LARGEST_WIDTH_IN_METRES ? value * METRES_PER_FOOT : value;
}

/** The drawn street width: the right-of-way less sidewalks and boulevards, kept in range. */
export function streetWidthM(rightOfWayM: number | undefined): number {
  const { fallback, min, max, verge } = CONTEXT_STREET_WIDTH_M;
  if (rightOfWayM === undefined) return fallback;
  const width = Math.min(max, Math.max(min, rightOfWayM - verge));
  return Math.round(width * DECIMETRES_PER_METRE) / DECIMETRES_PER_METRE;
}

export interface StreetLine {
  readonly points: readonly PlanePoint[];
  readonly widthM: number;
}

const roundCm = (value: number) =>
  Math.round(value * CENTIMETRES_PER_METRE) / CENTIMETRES_PER_METRE;

/**
 * One stall per space, as a 6 by 2.4 m ring along the nearest street. Stalls sit inside the curb
 * on the side of the street the meter stands on, end to end and centred on the meter.
 */
export function parkingStalls(
  meter: PlanePoint,
  street: StreetLine,
  spaces: number,
): PlanePoint[][] {
  const foot = nearestOnPolyline(meter, street.points);
  if (foot === undefined) return [];
  const along = foot.direction;
  const left = { x: -along.y, y: along.x };
  const side = (meter.x - foot.point.x) * left.x + (meter.y - foot.point.y) * left.y >= 0 ? 1 : -1;
  const out = { x: left.x * side, y: left.y * side };
  const curb = street.widthM * HALF;
  const at = (alongM: number, outM: number): PlanePoint => ({
    x: roundCm(foot.point.x + along.x * alongM + out.x * outM),
    y: roundCm(foot.point.y + along.y * alongM + out.y * outM),
  });
  const start = -spaces * STALL_LENGTH_M * HALF;
  return Array.from({ length: spaces }, (_, index) => {
    const from = start + index * STALL_LENGTH_M;
    const to = from + STALL_LENGTH_M;
    const inner = curb - STALL_DEPTH_M;
    return [at(from, inner), at(to, inner), at(to, curb), at(from, curb)];
  });
}
