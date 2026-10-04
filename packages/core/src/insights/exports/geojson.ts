import { pathEntryId } from '../../metrics/footprints.js';
import type { PlanePoint } from '../../schema/geometry.js';
import type { Parcel } from '../../schema/parcel.js';

import type { ExportInput, RankedInsightDesign } from './top-designs.js';

// WGS84 semi-major axis. Over a park a few hundred metres across, treating the ground as flat
// around the parcel origin is off by millimetres.
const EARTH_RADIUS_M = 6_378_137;
const DEGREES_PER_HALF_TURN = 180;
const COORDINATE_DECIMALS = 8;

type Position = [number, number];

const toRadians = (degrees: number) => (degrees * Math.PI) / DEGREES_PER_HALF_TURN;
const toDegrees = (radians: number) => (radians * DEGREES_PER_HALF_TURN) / Math.PI;
const rounded = (value: number) => Number(value.toFixed(COORDINATE_DECIMALS));

/** Longitude and latitude of a local point, metres east and north of the parcel origin. */
export function localToLonLat(origin: Parcel['origin'], point: PlanePoint): Position {
  const lat = origin.lat + toDegrees(point.y / EARTH_RADIUS_M);
  const lon = origin.lon + toDegrees(point.x / (EARTH_RADIUS_M * Math.cos(toRadians(origin.lat))));
  return [rounded(lon), rounded(lat)];
}

interface Feature {
  readonly type: 'Feature';
  readonly geometry: { readonly type: string; readonly coordinates: unknown };
  readonly properties: Readonly<Record<string, string | number>>;
}

function designFeatures(entry: RankedInsightDesign, input: ExportInput): Feature[] {
  const { design } = entry;
  const at = (point: PlanePoint) => localToLonLat(input.parcel.origin, point);
  const categoryOf = (catalogId: string) => input.catalog.get(catalogId)?.category ?? 'amenity';
  const feature = (
    geometry: Feature['geometry'],
    element: { elementId: string; kind: string; catalogId: string },
  ): Feature => ({
    type: 'Feature',
    geometry,
    properties: {
      rank: entry.rank,
      designId: design.id,
      title: design.title,
      elementId: element.elementId,
      kind: element.kind,
      category: categoryOf(element.catalogId),
      catalogId: element.catalogId,
    },
  });
  const { items, paths, areas } = design.document;
  return [
    ...items.map((item) =>
      feature(
        { type: 'Point', coordinates: at(item.position) },
        { elementId: item.id, kind: 'item', catalogId: item.catalogId },
      ),
    ),
    ...paths.map((path) =>
      feature(
        { type: 'LineString', coordinates: path.points.map(at) },
        { elementId: path.id, kind: 'path', catalogId: pathEntryId(path.surface) },
      ),
    ),
    ...areas.map((area) => {
      const ring = [...area.polygon, ...area.polygon.slice(0, 1)].map(at);
      return feature(
        { type: 'Polygon', coordinates: [ring] },
        { elementId: area.id, kind: 'area', catalogId: area.catalogId },
      );
    }),
  ];
}

/** The top designs as one GeoJSON FeatureCollection in WGS84, one feature per element. */
export function* geoJsonChunks(input: ExportInput): Generator<string> {
  yield '{"type":"FeatureCollection","features":[';
  let first = true;
  for (const entry of input.designs) {
    for (const feature of designFeatures(entry, input)) {
      yield (first ? '' : ',') + JSON.stringify(feature);
      first = false;
    }
  }
  yield ']}\n';
}
