import { describe, expect, it } from 'vitest';

import baseline from '../fixtures/baseline.json' with { type: 'json' };

import { catalogIndex } from './catalog/catalog.js';
import { rectangleParcel } from './metrics/fixtures/design-builders.js';
import { runMetrics } from './metrics-command.js';
import { designDocumentSchema } from './schema/design.js';
import { parcelContains, parcelSchema } from './schema/parcel.js';
import { metres } from './schema/units.js';
import { runValidate, validateDesignText, type ValidationReport } from './validate-command.js';

const BASELINE_TEXT = JSON.stringify(baseline);
const PARCEL_TEXT = JSON.stringify(rectangleParcel(120, 115));
const BASELINE_FILES = { 'fx/baseline.json': BASELINE_TEXT, 'fx/parcel.json': PARCEL_TEXT };

function commandOptions(args: readonly string[], files: Record<string, string>, lines: string[]) {
  return {
    args,
    readText: (path: string) => {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT: ${path}`);
      return text;
    },
    readOptionalText: (path: string) => files[path],
    siblingPath: (path: string, name: string) => path.replace(/[^/]*$/, name),
    print: (line: string) => lines.push(line),
    catalog: catalogIndex,
  };
}

function run(args: readonly string[], files: Record<string, string>) {
  const lines: string[] = [];
  const exitCode = runValidate(commandOptions(args, files, lines));
  return { exitCode, output: lines.join('\n') };
}

function runMetricsOn(args: readonly string[], files: Record<string, string>) {
  const lines: string[] = [];
  runMetrics(commandOptions(args, files, lines));
  return lines;
}

const TOTAL_LINE = /^\s*(Cost|Garden plots):/;

function expectValid(report: ValidationReport) {
  if (report.kind !== 'valid') throw new Error(`expected a valid report, got ${report.kind}`);
  return report.summary;
}

describe('validateDesignText', () => {
  it('summarises the baseline by category and locks', () => {
    const summary = expectValid(validateDesignText(BASELINE_TEXT, catalogIndex));
    expect(summary.counts.tree).toBe(18);
    expect(summary.counts.seating).toBe(2);
    expect(summary.counts.washroom).toBe(1);
    expect(summary.counts.sports).toBe(1);
    expect(summary.counts.garden).toBe(1);
    expect(summary.counts.path).toBe(1);
    expect(summary.lockedCount).toBe(11);
  });

  it('reports text that is not JSON', () => {
    expect(validateDesignText('{', catalogIndex).kind).toBe('invalidJson');
  });

  it('reports schema problems with their paths', () => {
    const report = validateDesignText(JSON.stringify({ ...baseline, version: 2 }), catalogIndex);
    expect(report).toMatchObject({ kind: 'invalidDocument' });
    if (report.kind === 'invalidDocument') expect(report.issues.join('\n')).toContain('version');
  });

  it('reports catalog references that do not resolve', () => {
    const items = [{ ...baseline.items[0], catalogId: 'hot-tub' }];
    const report = validateDesignText(JSON.stringify({ ...baseline, items }), catalogIndex);
    expect(report).toMatchObject({ kind: 'catalogIssues' });
  });
});

describe('baseline fixture', () => {
  const design = designDocumentSchema.parse(baseline);
  const parcel = parcelSchema.parse({
    id: 'jonathan-rogers',
    name: 'Jonathan Rogers Park',
    polygon: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 115 },
      { x: 0, y: 115 },
    ],
    origin: { lat: 49.2637, lon: -123.0972 },
  });

  it('keeps every item and path point inside the parcel', () => {
    const points = [
      ...design.items.map((item) => item.position),
      ...design.paths.flatMap((path) => path.points),
    ];
    points.forEach((point) => {
      expect(parcelContains(parcel, point)).toBe(true);
    });
  });

  it('locks the washroom and 10 of the trees', () => {
    const lockedTrees = design.items.filter(
      (item) => item.locked && catalogIndex.get(item.catalogId)?.category === 'tree',
    );
    expect(lockedTrees).toHaveLength(10);
    const washroom = design.items.find((item) => item.catalogId === 'washroom-building');
    expect(washroom?.locked).toBe(true);
  });

  it('places the garden in the north-west quarter and closes the gravel loop', () => {
    const garden = design.areas.find((area) => area.catalogId === 'community-garden');
    garden?.polygon.forEach((point) => {
      expect(point.x).toBeLessThan(metres(60));
      expect(point.y).toBeGreaterThan(metres(57.5));
    });
    const loop = design.paths[0];
    expect(loop?.surface).toBe('gravel');
    expect(loop?.points.at(0)).toEqual(loop?.points.at(-1));
  });
});

describe('runValidate', () => {
  it('prints the summary and exits 0 for a valid file', () => {
    const { exitCode, output } = run(['fx/baseline.json'], BASELINE_FILES);
    expect(exitCode).toBe(0);
    expect(output).toContain('Valid design: fx/baseline.json');
    expect(output).toContain('tree: 18');
    expect(output).toContain('Garden plots: 18');
    expect(output).toContain('Cost: $121,220 CAD');
  });

  it('prints the same totals as the metrics command for the baseline', () => {
    const validateTotals = run(['fx/baseline.json'], BASELINE_FILES)
      .output.split('\n')
      .filter((line) => TOTAL_LINE.test(line));
    const metricsTotals = runMetricsOn(['fx/baseline.json'], BASELINE_FILES).filter((line) =>
      TOTAL_LINE.test(line),
    );
    expect(validateTotals).toHaveLength(2);
    expect(validateTotals).toEqual(metricsTotals);
  });

  it('exits 1 when the parcel next to a valid design is missing', () => {
    const { exitCode, output } = run(['fx/baseline.json'], { 'fx/baseline.json': BASELINE_TEXT });
    expect(exitCode).toBe(1);
    expect(output).toContain('Cannot read fx/parcel.json');
  });

  it('prints usage and exits 2 without a path', () => {
    const { exitCode, output } = run([], {});
    expect(exitCode).toBe(2);
    expect(output).toContain('Usage');
  });

  it('exits 1 when the file cannot be read', () => {
    const { exitCode, output } = run(['missing.json'], {});
    expect(exitCode).toBe(1);
    expect(output).toContain('Cannot read missing.json');
  });

  it('exits 1 and lists problems for invalid JSON, schema and catalog errors', () => {
    const items = [{ ...baseline.items[0], catalogId: 'hot-tub' }];
    const files = {
      'bad.json': '{',
      'v2.json': JSON.stringify({ ...baseline, version: 2 }),
      'ref.json': JSON.stringify({ ...baseline, items }),
    };
    const bad = run(['bad.json'], files);
    expect(bad.exitCode).toBe(1);
    expect(bad.output).toContain('not valid JSON');
    const v2 = run(['v2.json'], files);
    expect(v2.exitCode).toBe(1);
    expect(v2.output).toContain('version');
    const ref = run(['ref.json'], files);
    expect(ref.exitCode).toBe(1);
    expect(ref.output).toContain('unknownCatalogId');
  });
});
