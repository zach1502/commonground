import { describe, expect, it } from 'vitest';

import {
  designOf,
  itemAt,
  rectangle,
  type DesignParts,
} from '../../metrics/fixtures/design-builders.js';

import { dxfChunks, layerName } from './dxf.js';
import { EXPORT_INPUT } from './export-fixtures.js';
import { joinChunks } from './top-designs.js';

interface DxfEntity {
  readonly type: string;
  readonly codes: [number, string][];
}

function readPairs(text: string): [number, string][] {
  const lines = text.split('\r\n');
  const pairs: [number, string][] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number((lines[index] ?? '').trim());
    if (Number.isNaN(code)) throw new Error(`Bad group code on line ${String(index + 1)}`);
    pairs.push([code, lines[index + 1] ?? '']);
  }
  return pairs;
}

/**
 * Splits the named section at code 0. The first entry holds the pairs before the first
 * entity, such as header variables.
 */
function readSection(text: string, name: string): DxfEntity[] {
  const pairs = readPairs(text);
  const start = pairs.findIndex(
    ([code, value], index) => code === 2 && value === name && pairs[index - 1]?.[1] === 'SECTION',
  );
  const entities: DxfEntity[] = [{ type: name, codes: [] }];
  for (const [code, value] of pairs.slice(start + 1)) {
    if (code === 0 && value === 'ENDSEC') break;
    if (code === 0) entities.push({ type: value, codes: [] });
    else entities.at(-1)?.codes.push([code, value]);
  }
  return entities;
}

const valueOf = (entity: DxfEntity | undefined, code: number) =>
  entity?.codes.find(([found]) => found === code)?.[1];

// Built inside each test, so a writer that throws fails that test instead of the whole file.
const dxfText = () => joinChunks(dxfChunks(EXPORT_INPUT));
const entitiesOf = () => readSection(dxfText(), 'ENTITIES').slice(1);
const tablesOf = () => readSection(dxfText(), 'TABLES').slice(1);

describe('dxfChunks', () => {
  it('writes an R12 header and ends with EOF', () => {
    expect(readSection(dxfText(), 'HEADER')[0]?.codes).toEqual([
      [9, '$ACADVER'],
      [1, 'AC1009'],
    ]);
    expect(dxfText().endsWith('0\r\nEOF\r\n')).toBe(true);
  });

  it('uses circles for trees and polylines for items, paths, areas and the parcel', () => {
    const types = entitiesOf()
      .map((entity) => entity.type)
      .filter((type) => type !== 'VERTEX');
    expect(types).toEqual([
      'POLYLINE',
      'SEQEND',
      'CIRCLE',
      'POLYLINE',
      'SEQEND',
      'POLYLINE',
      'SEQEND',
      'POLYLINE',
      'SEQEND',
    ]);
    expect(entitiesOf().some((entity) => entity.type === 'INSERT')).toBe(false);
  });
});

describe('dxfChunks layers', () => {
  it('puts each element on a layer named for its rank and category', () => {
    const circle = entitiesOf().find((entity) => entity.type === 'CIRCLE');
    expect(valueOf(circle, 8)).toBe('R01-TREE');
    expect(Number(valueOf(circle, 10))).toBe(5);
    expect(Number(valueOf(circle, 40))).toBeGreaterThan(0);
    const layers = new Set(entitiesOf().map((entity) => valueOf(entity, 8)));
    expect([...layers].sort()).toEqual([
      'PARCEL',
      'R01-PATH',
      'R01-SEATING',
      'R01-TREE',
      'R02-GARDEN',
    ]);
  });

  it('declares every used layer in the LAYER table', () => {
    const declared = tablesOf()
      .filter((entry) => entry.type === 'LAYER')
      .map((entry) => valueOf(entry, 2));
    const used = new Set(entitiesOf().map((entity) => valueOf(entity, 8)));
    expect(new Set(declared)).toEqual(used);
  });

  it('closes areas and leaves paths open, with one vertex per point', () => {
    const polylines = entitiesOf().filter((entity) => entity.type === 'POLYLINE');
    const flags = polylines.map((entity) => [valueOf(entity, 8), valueOf(entity, 70)]);
    expect(flags).toEqual([
      ['PARCEL', '1'],
      ['R01-SEATING', '1'],
      ['R01-PATH', '0'],
      ['R02-GARDEN', '1'],
    ]);
    const pathStart = entitiesOf().findIndex((entity) => valueOf(entity, 8) === 'R01-PATH');
    const vertices = entitiesOf()
      .slice(pathStart + 1)
      .findIndex((entity) => entity.type === 'SEQEND');
    expect(vertices).toBe(3);
  });
});

describe('layerName', () => {
  it('pads the rank and uses upper case', () => {
    expect(layerName(3, 'dog')).toBe('R03-DOG');
  });
});

const [first] = EXPORT_INPUT.designs;
const drawItems = (items: ReturnType<typeof itemAt>[], areas: DesignParts['areas'] = []) => {
  if (first === undefined) throw new Error('fixture has designs');
  const design = { ...first.design, document: designOf({ items, areas }) };
  const text = joinChunks(dxfChunks({ ...EXPORT_INPUT, designs: [{ ...first, design }] }));
  return readSection(text, 'ENTITIES').slice(1);
};
const vertices = (entities: DxfEntity[], layer: string) =>
  entities
    .filter((entity) => entity.type === 'VERTEX' && valueOf(entity, 8) === layer)
    .map((entity) => [Number(valueOf(entity, 10)), Number(valueOf(entity, 20))]);

describe('dxfChunks drawing', () => {
  it('draws the 1.8 by 1 m bench footprint around its position', () => {
    expect(vertices(drawItems([itemAt('b1', 'bench', 8, 8)]), 'R01-SEATING')).toEqual([
      [7.1, 7.5],
      [8.9, 7.5],
      [8.9, 8.5],
      [7.1, 8.5],
    ]);
  });
  it('turns the footprint with the item rotation', () => {
    const turned = { ...itemAt('b1', 'bench', 8, 8), rotationDeg: 90 };
    expect(vertices(drawItems([turned]), 'R01-SEATING')).toEqual([
      [8.5, 7.1],
      [8.5, 8.9],
      [7.5, 8.9],
      [7.5, 7.1],
    ]);
  });
  it('skips items the catalog does not know and files unknown areas under amenity', () => {
    const area = {
      id: 'a',
      catalogId: 'not-in-catalog',
      polygon: rectangle(0, 0, 4, 4),
      locked: false,
    };
    const entities = drawItems([itemAt('x', 'not-in-catalog', 1, 1)], [area]);
    const layers = entities
      .filter((entity) => entity.type === 'POLYLINE')
      .map((entity) => valueOf(entity, 8));
    expect(layers).toEqual(['PARCEL', 'R01-AMENITY']);
  });
});

describe('dxfChunks structure', () => {
  it('writes the sections, tables and entities in R12 order', () => {
    const polyline = (vertexCount: number) => [
      'POLYLINE',
      ...Array<string>(vertexCount).fill('VERTEX'),
      'SEQEND',
    ];
    const entityCodes = readPairs(dxfText())
      .filter(([code]) => code === 0)
      .map(([, value]) => value);
    expect(entityCodes).toEqual([
      'SECTION',
      'ENDSEC',
      'SECTION',
      'TABLE',
      'LTYPE',
      'ENDTAB',
      'TABLE',
      ...Array<string>(5).fill('LAYER'),
      'ENDTAB',
      'ENDSEC',
      'SECTION',
      ...polyline(4),
      'CIRCLE',
      ...polyline(4),
      ...polyline(3),
      ...polyline(4),
      'ENDSEC',
      'EOF',
    ]);
  });
});

describe('dxfChunks tables', () => {
  it('declares a solid CONTINUOUS line type before the layers', () => {
    expect(readSection(dxfText(), 'TABLES')[0]?.codes).toEqual([]);
    const [lineTable, lineType] = tablesOf();
    expect(lineTable).toEqual({
      type: 'TABLE',
      codes: [
        [2, 'LTYPE'],
        [70, '1'],
      ],
    });
    expect(lineType).toEqual({
      type: 'LTYPE',
      codes: [
        [2, 'CONTINUOUS'],
        [70, '0'],
        [3, 'Solid line'],
        [72, '65'],
        [73, '0'],
        [40, '0'],
      ],
    });
    const layerTable = tablesOf().find(
      (entry) => entry.type === 'TABLE' && valueOf(entry, 2) === 'LAYER',
    );
    expect(layerTable?.codes).toEqual([
      [2, 'LAYER'],
      [70, '5'],
    ]);
    const parcel = tablesOf().find((entry) => entry.type === 'LAYER');
    expect(parcel?.codes).toEqual([
      [2, 'PARCEL'],
      [70, '0'],
      [62, '7'],
      [6, 'CONTINUOUS'],
    ]);
  });
});
