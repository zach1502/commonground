import type { CatalogIndex } from '../../catalog/catalog.js';
import { pathEntryId } from '../../metrics/footprints.js';
import type { Category } from '../../schema/catalog.js';
import type { DesignItem } from '../../schema/design.js';
import type { PlanePoint } from '../../schema/geometry.js';

import type { ExportInput, RankedInsightDesign } from './top-designs.js';

// AutoCAD colour index 7 draws black on a light background and white on a dark one.
const LAYER_COLOUR = 7;
const RANK_DIGITS = 2;
const COORDINATE_DECIMALS = 3;
const HALF = 0.5;
const DEGREES_PER_HALF_TURN = 180;
const LINE_END = '\r\n';
const PARCEL_LAYER = 'PARCEL';
// Group codes are right-aligned in three columns, as AutoCAD writes them.
const GROUP_CODE_WIDTH = 3;

// DXF group codes this writer uses.
const CODE_ENTITY = 0;
const CODE_TEXT = 1;
const CODE_NAME = 2;
const CODE_DESCRIPTION = 3;
const CODE_LINE_TYPE = 6;
const CODE_LAYER = 8;
const CODE_VARIABLE = 9;
const CODE_X = 10;
const CODE_Y = 20;
const CODE_Z = 30;
const CODE_RADIUS = 40;
const CODE_COLOUR = 62;
const CODE_FOLLOWS_VERTICES = 66;
const CODE_FLAGS = 70;
const CODE_ALIGNMENT = 72;
const CODE_DASH_COUNT = 73;
// Line type alignment code, always the letter A.
const ALIGN_A = 65;

type Pair = readonly [number, string | number];

const pairs = (list: readonly Pair[]) =>
  list
    .map(
      ([code, value]) =>
        `${String(code).padStart(GROUP_CODE_WIDTH)}${LINE_END}${String(value)}${LINE_END}`,
    )
    .join('');
const coordinate = (value: number) => Number(value.toFixed(COORDINATE_DECIMALS));

/** R12 layer names allow upper-case letters, digits, dashes and underscores. */
export function layerName(rank: number, category: Category): string {
  return `R${String(rank).padStart(RANK_DIGITS, '0')}-${category.toUpperCase()}`;
}

type Closure = 'open' | 'closed';

function polyline(layer: string, points: readonly PlanePoint[], closure: Closure): string {
  const head = pairs([
    [CODE_ENTITY, 'POLYLINE'],
    [CODE_LAYER, layer],
    [CODE_FOLLOWS_VERTICES, 1],
    [CODE_FLAGS, closure === 'closed' ? 1 : 0],
    [CODE_X, 0],
    [CODE_Y, 0],
    [CODE_Z, 0],
  ]);
  const vertices = points.map((point) =>
    pairs([
      [CODE_ENTITY, 'VERTEX'],
      [CODE_LAYER, layer],
      [CODE_X, coordinate(point.x)],
      [CODE_Y, coordinate(point.y)],
      [CODE_Z, 0],
    ]),
  );
  return (
    head +
    vertices.join('') +
    pairs([
      [CODE_ENTITY, 'SEQEND'],
      [CODE_LAYER, layer],
    ])
  );
}

function circle(layer: string, centre: PlanePoint, radiusM: number): string {
  return pairs([
    [CODE_ENTITY, 'CIRCLE'],
    [CODE_LAYER, layer],
    [CODE_X, coordinate(centre.x)],
    [CODE_Y, coordinate(centre.y)],
    [CODE_Z, 0],
    [CODE_RADIUS, coordinate(radiusM)],
  ]);
}

function rectangleCorners(item: DesignItem, widthM: number, depthM: number): PlanePoint[] {
  const angle = (item.rotationDeg * Math.PI) / DEGREES_PER_HALF_TURN;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  return corners.map(([sx, sy]) => {
    const dx = sx * widthM * HALF;
    const dy = sy * depthM * HALF;
    return { x: item.position.x + dx * cos - dy * sin, y: item.position.y + dx * sin + dy * cos };
  });
}

interface Drawn {
  readonly layer: string;
  readonly entity: string;
}

/** Trees are crown circles; other items are their footprint rectangle. */
function itemEntity(item: DesignItem, rank: number, catalog: CatalogIndex): Drawn[] {
  const entry = catalog.get(item.catalogId);
  if (entry?.geometryKind !== 'point') return [];
  const layer = layerName(rank, entry.category);
  const { widthM, depthM } = entry.footprint;
  const entity =
    entry.category === 'tree'
      ? circle(layer, item.position, entry.crownRadiusMatureM ?? widthM * HALF)
      : polyline(layer, rectangleCorners(item, widthM, depthM), 'closed');
  return [{ layer, entity }];
}

function designEntities(entry: RankedInsightDesign, catalog: CatalogIndex): Drawn[] {
  const { rank, design } = entry;
  const { items, paths, areas } = design.document;
  const categoryOf = (catalogId: string) => catalog.get(catalogId)?.category ?? 'amenity';
  return [
    ...items.flatMap((item) => itemEntity(item, rank, catalog)),
    ...paths.map((path) => {
      const layer = layerName(rank, categoryOf(pathEntryId(path.surface)));
      return { layer, entity: polyline(layer, path.points, 'open') };
    }),
    ...areas.map((area) => {
      const layer = layerName(rank, categoryOf(area.catalogId));
      return { layer, entity: polyline(layer, area.polygon, 'closed') };
    }),
  ];
}

function layerTable(layers: readonly string[]): string {
  const entries = layers.map((name) =>
    pairs([
      [CODE_ENTITY, 'LAYER'],
      [CODE_NAME, name],
      [CODE_FLAGS, 0],
      [CODE_COLOUR, LAYER_COLOUR],
      [CODE_LINE_TYPE, 'CONTINUOUS'],
    ]),
  );
  const lineType = pairs([
    [CODE_ENTITY, 'TABLE'],
    [CODE_NAME, 'LTYPE'],
    [CODE_FLAGS, 1],
    [CODE_ENTITY, 'LTYPE'],
    [CODE_NAME, 'CONTINUOUS'],
    [CODE_FLAGS, 0],
    [CODE_DESCRIPTION, 'Solid line'],
    [CODE_ALIGNMENT, ALIGN_A],
    [CODE_DASH_COUNT, 0],
    [CODE_RADIUS, 0],
    [CODE_ENTITY, 'ENDTAB'],
  ]);
  const head = pairs([
    [CODE_ENTITY, 'TABLE'],
    [CODE_NAME, 'LAYER'],
    [CODE_FLAGS, layers.length],
  ]);
  return lineType + head + entries.join('') + pairs([[CODE_ENTITY, 'ENDTAB']]);
}

const section = (name: string, body: string) =>
  pairs([
    [CODE_ENTITY, 'SECTION'],
    [CODE_NAME, name],
  ]) +
  body +
  pairs([[CODE_ENTITY, 'ENDSEC']]);

/**
 * The top designs as an ASCII DXF R12 drawing in local metres, one layer per design rank and
 * category, with no blocks, so any CAD tool opens it.
 */
export function* dxfChunks(input: ExportInput): Generator<string> {
  const drawn: Drawn[] = [
    { layer: PARCEL_LAYER, entity: polyline(PARCEL_LAYER, input.parcel.polygon, 'closed') },
    ...input.designs.flatMap((entry) => designEntities(entry, input.catalog)),
  ];
  const layers = [...new Set(drawn.map(({ layer }) => layer))];
  yield section(
    'HEADER',
    pairs([
      [CODE_VARIABLE, '$ACADVER'],
      [CODE_TEXT, 'AC1009'],
    ]),
  );
  yield section('TABLES', layerTable(layers));
  yield pairs([
    [CODE_ENTITY, 'SECTION'],
    [CODE_NAME, 'ENTITIES'],
  ]);
  for (const { entity } of drawn) yield entity;
  yield pairs([
    [CODE_ENTITY, 'ENDSEC'],
    [CODE_ENTITY, 'EOF'],
  ]);
}
