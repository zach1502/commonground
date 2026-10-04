import { describe, expect, it } from 'vitest';

import { designOf, itemAt, rectangle } from '../../metrics/fixtures/design-builders.js';

import { csvChunks, CSV_HEADER } from './csv.js';
import { EXPORT_INPUT } from './export-fixtures.js';
import { joinChunks } from './top-designs.js';

// Built inside each test, so a writer that throws fails that test instead of the whole file.
const csvLines = () => joinChunks(csvChunks(EXPORT_INPUT)).trimEnd().split('\r\n');

describe('csvChunks', () => {
  it('writes one header line and one row per design', () => {
    expect(csvLines()[0]).toBe(CSV_HEADER.join(','));
    expect(csvLines()).toHaveLength(1 + EXPORT_INPUT.designs.length);
  });

  it('quotes fields with commas or quotes and doubles inner quotes', () => {
    expect(csvLines()[1]).toBe('1,d1,"Shade, ""quiet"" corner",0.750,5,1,-12.5,1,1,1,0,0,0');
  });

  it('leaves earthworks empty when a design has no metrics', () => {
    expect(csvLines()[2]).toBe('2,d2,Design d2,0.500,0,0,,0,0,0,0,1,0');
  });

  it('keeps a spreadsheet from reading a title as a formula', () => {
    const [first] = EXPORT_INPUT.designs;
    if (first === undefined) throw new Error('fixture has designs');
    const risky = { ...first, design: { ...first.design, title: '=HYPERLINK("x")' } };
    const row = joinChunks(csvChunks({ ...EXPORT_INPUT, designs: [risky] })).split('\r\n')[1];
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('has a header count that matches every row', () => {
    csvLines().forEach((line) => {
      const withoutQuoted = line.replace(/"(?:[^"]|"")*"/g, 'q');
      expect(withoutQuoted.split(',')).toHaveLength(CSV_HEADER.length);
    });
  });
});

describe('csvChunks columns', () => {
  const [first] = EXPORT_INPUT.designs;
  const rowFor = (design: NonNullable<typeof first>['design']) => {
    if (first === undefined) throw new Error('fixture has designs');
    const text = joinChunks(csvChunks({ ...EXPORT_INPUT, designs: [{ ...first, design }] }));
    return text.split('\r\n')[1];
  };

  it('names the columns a planner imports', () => {
    expect(csvLines()[0]).toBe(
      'rank,design_id,title,score,votes_up,votes_down,net_earthworks_m3,paths,trees,seating,play,gardens,dog_areas',
    );
  });

  it('counts play items, dog areas and locked trees', () => {
    if (first === undefined) throw new Error('fixture has designs');
    const document = designOf({
      items: [
        { ...itemAt('old', 'garry-oak', 3, 3), locked: true },
        itemAt('play', 'playground-structure', 20, 20),
      ],
      areas: [
        {
          id: 'dogs',
          catalogId: 'off-leash-area',
          polygon: rectangle(0, 20, 10, 30),
          locked: false,
        },
      ],
    });
    expect(rowFor({ ...first.design, document })).toMatch(/,0,1,0,1,0,1$/);
  });

  it('leaves a title with an inner hyphen or at sign as it is', () => {
    if (first === undefined) throw new Error('fixture has designs');
    expect(rowFor({ ...first.design, title: 'Play-hill loop @ dusk' })).toContain(
      ',Play-hill loop @ dusk,',
    );
  });

  it('quotes a defused formula even when it has no comma or quote', () => {
    if (first === undefined) throw new Error('fixture has designs');
    expect(rowFor({ ...first.design, title: '@SUM(A1)' })).toContain(`,"'@SUM(A1)",`);
  });
});
