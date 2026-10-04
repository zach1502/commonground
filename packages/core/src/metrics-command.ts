import {
  costAndPlotLines,
  measureDesignFile,
  type DesignFileAccess,
} from './design-measurement.js';
import { formatCubicMetres, formatPercentValue } from './metrics/format.js';
import type { MetricsReport } from './metrics/report.js';
import { ok, type Result } from './result.js';
import { CONSTRAINT_KEYS } from './schema/parameters.js';

const USAGE_EXIT_CODE = 2;
const KEY_COLUMN = 18;
const STATUS_COLUMN = 8;
const SEVERITY_COLUMN = 10;
const NUMBER_COLUMN = 12;
const TABLE_DECIMALS = 2;

export interface MetricsCommandOptions extends DesignFileAccess {
  readonly args: readonly string[];
  readonly print: (line: string) => void;
}

const cell = (text: string, width: number) => text.padEnd(width);
const tableNumber = (value: number | undefined) =>
  value === undefined ? '' : String(Number(value.toFixed(TABLE_DECIMALS)));

function constraintRows(report: MetricsReport): string[] {
  const header = [
    cell('Constraint', KEY_COLUMN),
    cell('Status', STATUS_COLUMN),
    cell('Severity', SEVERITY_COLUMN),
    cell('Value', NUMBER_COLUMN),
    cell('Limit', NUMBER_COLUMN),
    'Message',
  ].join('');
  const rows = CONSTRAINT_KEYS.map((key) => {
    const { status, severity, value, limit, message } = report.constraints[key];
    return [
      cell(key, KEY_COLUMN),
      cell(status, STATUS_COLUMN),
      cell(severity, SEVERITY_COLUMN),
      cell(tableNumber(value), NUMBER_COLUMN),
      cell(tableNumber(limit), NUMBER_COLUMN),
      message,
    ].join('');
  });
  return [header, ...rows];
}

function totalRows(report: MetricsReport): string[] {
  const { totals } = report;
  return [
    'Totals',
    ...costAndPlotLines(report),
    `  Canopy: ${formatPercentValue(totals.canopyPercent)}`,
    `  Impervious: ${formatPercentValue(totals.imperviousPercent)}`,
    `  Water: ${formatPercentValue(totals.waterPercent)}`,
    `  Cut: ${formatCubicMetres(totals.cut)}, fill: ${formatCubicMetres(totals.fill)}, net: ${formatCubicMetres(totals.net)}`,
    `  Truck trips: ${String(totals.truckTrips)}`,
    `  Disturbed: ${formatPercentValue(totals.disturbedPercent)}`,
    `Submittable: ${report.isSubmittable ? 'yes' : 'no'}`,
  ];
}

function reportLines(path: string, options: MetricsCommandOptions): Result<string[], string[]> {
  const measured = measureDesignFile(options, path);
  if (!measured.ok) return measured;
  const { report, terrainSource } = measured.value;
  const title = `Metrics for ${path} on ${terrainSource}, with the demo parameters`;
  return ok([title, ...constraintRows(report), ...totalRows(report)]);
}

/** Runs the metrics command and returns its exit code. File access is injected for tests. */
export function runMetrics(options: MetricsCommandOptions): number {
  const [path] = options.args;
  if (path === undefined) {
    options.print('Usage: metrics <design.json>. parcel.json must sit next to it.');
    return USAGE_EXIT_CODE;
  }
  const lines = reportLines(path, options);
  (lines.ok ? lines.value : lines.error).forEach(options.print);
  return lines.ok ? 0 : 1;
}
