import {
  CONTEXT_BIKEWAY_WIDTH_M,
  CONTEXT_BUFFER_M,
  CONTEXT_SIDEWALK_WIDTH_M,
  CONTEXT_STREET_WIDTH_M,
  siteContextSchema,
  type ContextFeatureKind,
  type PlanePoint,
  type SiteContext,
} from '@parkshape/core';

/**
 * A stand-in for the recorded context around Jonathan Rogers Park, for tests and the dev page.
 * The streets sit where public-streets puts them around the 176 by 86 m parcel box: W 7th Ave
 * on the north, W 8th Ave on the south, Columbia St on the west and Manitoba St on the east.
 */
const PARCEL = { width: 176, depth: 86 } as const;
// From a street centreline to the middle of its sidewalk, so the park-side sidewalks sit 1.5 m
// outside the parcel edge, as the city lines do.
const SIDEWALK_OFFSET_M = 8.5;
// The block grid: one block north to south is about 106 m, east to west about 104 m.
const STREET_GAP_M = 10;
const ROW_STREET_M = CONTEXT_STREET_WIDTH_M.max;
const PLAIN_STREET_M = CONTEXT_STREET_WIDTH_M.fallback;
const REACH = CONTEXT_BUFFER_M;
const STALL = { lengthM: 6, depthM: 2.4, count: 8, startX: 20 } as const;
// W Broadway runs one block south of W 8th Ave.
const BROADWAY_Y = -116;
const HALF = 2;

const VANCOUVER = (datasetId: string) => ({ name: 'Vancouver Open Data', datasetId });
const TRANSLINK = { name: 'TransLink', datasetId: 'google_transit' };

interface StreetLine {
  readonly name: string;
  readonly axis: 'east-west' | 'north-south';
  /** y for an east-west street, x for a north-south one. */
  readonly at: number;
  readonly widthM: number;
}

const STREETS: readonly StreetLine[] = [
  { name: 'W 7th Ave', axis: 'east-west', at: PARCEL.depth + STREET_GAP_M, widthM: PLAIN_STREET_M },
  { name: 'W 8th Ave', axis: 'east-west', at: -STREET_GAP_M, widthM: PLAIN_STREET_M },
  { name: 'W 6th Ave', axis: 'east-west', at: 202, widthM: PLAIN_STREET_M },
  { name: 'W Broadway', axis: 'east-west', at: BROADWAY_Y, widthM: ROW_STREET_M },
  { name: 'W 10th Ave', axis: 'east-west', at: -222, widthM: PLAIN_STREET_M },
  { name: 'Columbia St', axis: 'north-south', at: -STREET_GAP_M, widthM: ROW_STREET_M },
  {
    name: 'Manitoba St',
    axis: 'north-south',
    at: PARCEL.width + STREET_GAP_M,
    widthM: ROW_STREET_M,
  },
  { name: 'Alberta St', axis: 'north-south', at: -118, widthM: PLAIN_STREET_M },
  { name: 'Ontario St', axis: 'north-south', at: 290, widthM: ROW_STREET_M },
];

/** A feature before parsing: plain numbers, which the schema brands as metres. */
interface RawFeature {
  readonly id: string;
  readonly kind: ContextFeatureKind;
  readonly name?: string;
  readonly source: { readonly name: string; readonly datasetId: string };
  readonly geometry:
    | { readonly type: 'line'; readonly points: readonly PlanePoint[]; readonly widthM: number }
    | { readonly type: 'polygon'; readonly ring: readonly PlanePoint[] }
    | { readonly type: 'point'; readonly position: PlanePoint };
}

const point = (street: StreetLine, along: number, offset = 0): PlanePoint =>
  street.axis === 'east-west'
    ? { x: along, y: street.at + offset }
    : { x: street.at + offset, y: along };

function lineFeature(
  feature: Omit<RawFeature, 'geometry'>,
  points: readonly PlanePoint[],
  widthM: number,
): RawFeature {
  return { ...feature, geometry: { type: 'line', points, widthM } };
}

function span(street: StreetLine): readonly [number, number] {
  const size = street.axis === 'east-west' ? PARCEL.width : PARCEL.depth;
  return [-REACH, size + REACH];
}

/** The positions where cross streets meet this one, in order along it. */
function crossings(street: StreetLine): number[] {
  return STREETS.filter((other) => other.axis !== street.axis)
    .map((other) => other.at)
    .sort((a, b) => a - b);
}

function sidewalksOf(street: StreetLine, index: number): RawFeature[] {
  const [start, end] = span(street);
  const stops = [start, ...crossings(street), end];
  const lastBlock = stops.length - 1 - 1;
  return [-SIDEWALK_OFFSET_M, SIDEWALK_OFFSET_M].flatMap((offset, side) =>
    stops.slice(1).flatMap((to, block) => {
      const from = stops[block] ?? start;
      const a = block === 0 ? from : from + SIDEWALK_OFFSET_M;
      const b = block === lastBlock ? to : to - SIDEWALK_OFFSET_M;
      if (b - a <= 1) return [];
      return [
        lineFeature(
          {
            id: `sidewalk-${String(index)}-${String(side)}-${String(block)}`,
            kind: 'sidewalk',
            source: VANCOUVER('sidewalk-condition-rating'),
          },
          [point(street, a, offset), point(street, b, offset)],
          CONTEXT_SIDEWALK_WIDTH_M,
        ),
      ];
    }),
  );
}

function streetFeatures(): RawFeature[] {
  return STREETS.flatMap((street, index) => [
    lineFeature(
      {
        id: `street-${String(index)}`,
        kind: 'street',
        name: street.name,
        source: VANCOUVER('public-streets'),
      },
      span(street).map((along) => point(street, along)),
      street.widthM,
    ),
    ...sidewalksOf(street, index),
  ]);
}

function bikewayFeatures(): RawFeature[] {
  const bikeways = STREETS.filter((street) => ['W 7th Ave', 'Ontario St'].includes(street.name));
  return bikeways.map((street, index) =>
    lineFeature(
      {
        id: `bikeway-${String(index)}`,
        kind: 'bikeway',
        name: street.name,
        source: VANCOUVER('bikeways'),
      },
      span(street).map((along) => point(street, along)),
      CONTEXT_BIKEWAY_WIDTH_M,
    ),
  );
}

const BUS_STOPS = [
  { id: '50921', name: 'Westbound W Broadway @ Columbia St', x: 2, y: -107.5 },
  { id: '60006', name: 'Eastbound W Broadway @ Columbia St', x: -22, y: -124.5 },
  { id: '50920', name: 'Westbound W Broadway @ Ontario St', x: 302, y: -107.5 },
  { id: '60613', name: 'Eastbound W Broadway @ Ontario St', x: 278, y: -124.5 },
  { id: '60579', name: 'Westbound W Broadway @ Quebec St', x: 400, y: -107.5 },
] as const;

function busStopFeatures(): RawFeature[] {
  return BUS_STOPS.map((stop) => ({
    id: `bus-${stop.id}`,
    kind: 'busStop',
    name: stop.name,
    source: TRANSLINK,
    geometry: { type: 'point', position: { x: stop.x, y: stop.y } },
  }));
}

/** Metered stalls along the north curb of W Broadway, east of Columbia St. */
function parkingFeatures(): RawFeature[] {
  const curb = BROADWAY_Y + ROW_STREET_M / HALF;
  return Array.from({ length: STALL.count }, (_, index) => {
    const x = STALL.startX + index * STALL.lengthM;
    const corners = [
      { x, y: curb - STALL.depthM },
      { x: x + STALL.lengthM, y: curb - STALL.depthM },
      { x: x + STALL.lengthM, y: curb },
      { x, y: curb },
    ];
    return {
      id: `parking-${String(index)}`,
      kind: 'parking',
      source: VANCOUVER('parking-meters'),
      geometry: { type: 'polygon', ring: corners },
    } satisfies RawFeature;
  });
}

export const sampleSiteContext: SiteContext = siteContextSchema.parse({
  features: [...streetFeatures(), ...busStopFeatures(), ...parkingFeatures(), ...bikewayFeatures()],
  bufferM: CONTEXT_BUFFER_M,
  recordedAt: '2026-10-02T00:00:00.000Z',
});
