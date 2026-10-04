import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { catalogIndex } from './catalog/catalog.js';
import { designOf, itemAt, rectangleParcel } from './metrics/fixtures/design-builders.js';
import { runMetrics } from './metrics-command.js';

const BASELINE_TEXT = readFileSync(new URL('../fixtures/baseline.json', import.meta.url), 'utf8');
const PARCEL_TEXT = JSON.stringify(rectangleParcel(120, 115));
const HEIGHTMAP_TEXT = JSON.stringify({
  width: 120,
  height: 115,
  resolutionM: 1,
  originLocal: { x: 0, y: 0 },
  elevations: Array.from({ length: 120 * 115 }, () => 3),
});

function run(args: string[], files: Record<string, string>) {
  const lines: string[] = [];
  const code = runMetrics({
    args,
    readText: (path) => {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT ${path}`);
      return text;
    },
    readOptionalText: (path) => files[path],
    siblingPath: (path, name) => path.replace(/[^/]*$/, name),
    print: (line) => lines.push(line),
    catalog: catalogIndex,
  });
  return { code, output: lines.join('\n') };
}

describe('runMetrics', () => {
  it('prints the baseline report on a synthetic ramp', () => {
    const { code, output } = run(['fx/baseline.json'], {
      'fx/baseline.json': BASELINE_TEXT,
      'fx/parcel.json': PARCEL_TEXT,
    });
    expect(code).toBe(0);
    expect(output).toContain('synthetic ramp');
    expect(output).toMatch(/^budget\s+(ok|warn)\s+soft/m);
    expect(output).toMatch(/^requiredFeatures\s+fail\s+hard/m);
    expect(output).toContain('Submittable: no');
  });

  it('reads heightmap.json next to the design when it exists', () => {
    const design = JSON.stringify(designOf({ items: [itemAt('b', 'bench', 5, 5)] }));
    const { code, output } = run(['d.json'], {
      'd.json': design,
      'parcel.json': PARCEL_TEXT,
      'heightmap.json': HEIGHTMAP_TEXT,
    });
    expect(code).toBe(0);
    expect(output).toContain('heightmap.json');
    expect(output).toContain('Cost: $3,500 CAD');
  });

  it('prints usage without a path', () => {
    expect(run([], {}).code).toBe(2);
  });

  it('fails on a missing file, bad JSON or a bad document', () => {
    expect(run(['gone.json'], {}).code).toBe(1);
    expect(run(['d.json'], { 'd.json': '{', 'parcel.json': PARCEL_TEXT }).output).toContain(
      'd.json is not valid JSON',
    );
    const bad = run(['d.json'], { 'd.json': '{"version": 2}', 'parcel.json': PARCEL_TEXT });
    expect(bad).toMatchObject({ code: 1 });
    expect(bad.output).toContain('d.json is not valid:');
  });

  it('fails on a bad heightmap or unknown catalog ids', () => {
    const design = JSON.stringify(designOf({ items: [itemAt('b', 'no-such-item', 5, 5)] }));
    const files = { 'd.json': design, 'parcel.json': PARCEL_TEXT };
    expect(run(['d.json'], { ...files, 'heightmap.json': '{"width": 1}' }).code).toBe(1);
    const unknown = run(['d.json'], files);
    expect(unknown.code).toBe(1);
    expect(unknown.output).toContain('unknownCatalogId');
  });
});
