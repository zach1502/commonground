import { z } from 'zod';

import type { LonLat } from '../../geojson.js';
import type { ProposedFeature } from '../../ports/site-features-provider.js';
import type { SiteFrame } from '../projection/site-frame.js';

import { treeProfile } from './tree-lookup.js';

export const VANCOUVER_SOURCE = 'Vancouver Open Data';
const LICENCE = 'Open Government Licence - Vancouver';
const METRES_PER_FOOT = 0.3048;
// public-trees reports height as the middle of a 10 ft class, converted to metres.
const HEIGHT_CLASS_FT = 10;
const HALF = 0.5;
const ROUNDING = 10;
const SPORTS_WORDS = /field|pitch|diamond|court|sport/i;

const pointSchema = z.object({ lon: z.number(), lat: z.number() });
const positionSchema = z.tuple([z.number(), z.number()], z.number());
const ringSchema = z.array(positionSchema);
const parkGeometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ringSchema).min(1) }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(ringSchema).min(1)).min(1),
  }),
]);

export const parkRecordSchema = z.object({
  park_name: z.string(),
  geom: z.object({ geometry: parkGeometrySchema }),
});
export const treeRecordSchema = z.object({
  asset_id: z.number(),
  common_name: z.string().nullable(),
  genus_name: z.string().nullable(),
  species_name: z.string().nullable(),
  diameter_cm: z.number().nullable(),
  height_m: z.number().nullable(),
  geo_point_2d: pointSchema.nullable(),
});
export const gardenRecordSchema = z.object({
  mapid: z.string(),
  name: z.string().nullable(),
  number_of_plots: z.number().nullable().optional(),
  geo_point_2d: pointSchema.nullable(),
});
export const specialFeatureRecordSchema = z.object({
  parkid: z.number().nullable().optional(),
  name: z.string(),
  specialfeature: z.string(),
});

export type ParkRecord = z.output<typeof parkRecordSchema>;
type TreeRecordRow = z.output<typeof treeRecordSchema>;
type GardenRecordRow = z.output<typeof gardenRecordSchema>;
type SpecialFeatureRow = z.output<typeof specialFeatureRecordSchema>;

/** The outer ring of the park, taking the first part of a multipolygon. */
export function parkOuterRing(park: ParkRecord): LonLat[] {
  const { geometry } = park.geom;
  const ring = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0]?.[0];
  return (ring ?? []).map(([lon, lat]) => [lon, lat]);
}

function sentenceCase(text: string): string {
  const lower = text.trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const round1 = (value: number) => Math.round(value * ROUNDING) / ROUNDING;

function heightRange(heightM: number): readonly [number, number] {
  const middleFt =
    Math.round(heightM / METRES_PER_FOOT / (HEIGHT_CLASS_FT * HALF)) * HEIGHT_CLASS_FT * HALF;
  const halfClass = HEIGHT_CLASS_FT * HALF;
  return [
    round1((middleFt - halfClass) * METRES_PER_FOOT),
    round1((middleFt + halfClass) * METRES_PER_FOOT),
  ];
}

function provenance(datasetId: string, recordId: string) {
  return { source: VANCOUVER_SOURCE, datasetId, recordId, licence: LICENCE };
}

export function treeFeature(row: TreeRecordRow, site: SiteFrame): ProposedFeature | undefined {
  if (row.geo_point_2d === null) return undefined;
  const genus = row.genus_name ?? '';
  const species = row.species_name ?? '';
  const dbhCm = row.diameter_cm ?? undefined;
  const { catalogId, suggestedLocked, crownRadiusM, crownRadiusMatureM } = treeProfile({
    genus,
    species,
    dbhCm,
  });
  return {
    kind: 'tree',
    ...(catalogId === undefined ? {} : { catalogId }),
    position: site.localPoint([row.geo_point_2d.lon, row.geo_point_2d.lat]),
    attributes: {
      ...(row.common_name === null ? {} : { name: sentenceCase(row.common_name) }),
      species: sentenceCase(`${genus} ${species}`),
      ...(dbhCm === undefined ? {} : { dbhCm }),
      ...(row.height_m === null ? {} : { heightRangeM: heightRange(row.height_m) }),
      crownRadiusM,
      crownRadiusMatureM,
    },
    suggestedLocked,
    provenance: provenance('public-trees', String(row.asset_id)),
  };
}

export function gardenFeature(row: GardenRecordRow, site: SiteFrame): ProposedFeature | undefined {
  if (row.geo_point_2d === null) return undefined;
  const plots = row.number_of_plots ?? undefined;
  return {
    kind: 'garden',
    position: site.localPoint([row.geo_point_2d.lon, row.geo_point_2d.lat]),
    attributes: {
      ...(row.name === null ? {} : { name: row.name }),
      ...(plots === undefined ? {} : { plots }),
    },
    // Plots are leased to gardeners, so a design should keep the garden unless planners say so.
    suggestedLocked: true,
    provenance: provenance('community-gardens-and-food-trees', row.mapid),
  };
}

/** parks-special-features has no location, so the feature sits at the parcel centre. */
export function specialFeature(row: SpecialFeatureRow, site: SiteFrame): ProposedFeature {
  return {
    kind: SPORTS_WORDS.test(row.specialfeature) ? 'sportsField' : 'other',
    position: site.centre(),
    attributes: { name: row.specialfeature, approximatePosition: true },
    suggestedLocked: false,
    provenance: provenance(
      'parks-special-features',
      `${String(row.parkid ?? row.name)}:${row.specialfeature}`,
    ),
  };
}
