import type { CatalogIndex } from './catalog/catalog.js';
import { validateDesignAgainstCatalog, type CatalogIssue } from './catalog/design-references.js';
import {
  costAndPlotLines,
  measureDesignFile,
  parseJson,
  readFile,
  type DesignFileAccess,
} from './design-measurement.js';
import type { Category } from './schema/catalog.js';
import { designDocumentSchema, type DesignDocument } from './schema/design.js';

const USAGE_EXIT_CODE = 2;

export interface DesignSummary {
  readonly counts: Readonly<Partial<Record<Category, number>>>;
  readonly lockedCount: number;
}

export type ValidationReport =
  | { readonly kind: 'invalidJson'; readonly message: string }
  | { readonly kind: 'invalidDocument'; readonly issues: readonly string[] }
  | { readonly kind: 'catalogIssues'; readonly issues: readonly CatalogIssue[] }
  | { readonly kind: 'valid'; readonly summary: DesignSummary };

/** Only called after validateDesignAgainstCatalog, so every catalog id resolves. */
function summarise(design: DesignDocument, catalog: CatalogIndex): DesignSummary {
  const counts: Partial<Record<Category, number>> = {};
  const count = (category: Category) => {
    counts[category] = (counts[category] ?? 0) + 1;
  };
  const placed = [...design.items, ...design.areas].flatMap((element) => {
    const entry = catalog.get(element.catalogId);
    return entry === undefined ? [] : [{ element, entry }];
  });
  placed.forEach(({ entry }) => {
    count(entry.category);
  });
  design.paths.forEach(() => {
    count('path');
  });
  const lockedCount = [...design.items, ...design.areas].filter((element) => element.locked).length;
  return { counts, lockedCount };
}

/** Parses a design document, checks its catalog references and summarises it. */
export function validateDesignText(text: string, catalog: CatalogIndex): ValidationReport {
  const json = parseJson(text);
  if (!json.ok) return { kind: 'invalidJson', message: json.message };
  const parsed = designDocumentSchema.safeParse(json.value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    return { kind: 'invalidDocument', issues };
  }
  const catalogIssues = validateDesignAgainstCatalog(parsed.data, catalog);
  if (catalogIssues.length > 0) return { kind: 'catalogIssues', issues: catalogIssues };
  return { kind: 'valid', summary: summarise(parsed.data, catalog) };
}

function summaryLines(path: string, summary: DesignSummary): string[] {
  const categoryLines = Object.entries(summary.counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, total]) => `  ${category}: ${String(total)}`);
  return [
    `Valid design: ${path}`,
    'Counts by category:',
    ...categoryLines,
    `Locked: ${String(summary.lockedCount)}`,
  ];
}

function reportLines(path: string, report: ValidationReport): string[] {
  switch (report.kind) {
    case 'valid':
      return summaryLines(path, report.summary);
    case 'invalidJson':
      return [`${path} is not valid JSON: ${report.message}`];
    case 'invalidDocument':
      return [
        `${path} is not a valid design document:`,
        ...report.issues.map((issue) => `  ${issue}`),
      ];
    case 'catalogIssues':
      return [
        `${path} has catalog problems:`,
        ...report.issues.map((issue) => `  ${JSON.stringify(issue)}`),
      ];
  }
}

export interface ValidateCommandOptions extends DesignFileAccess {
  readonly args: readonly string[];
  readonly print: (line: string) => void;
}

/** Totals come from the metrics engine, so validate and metrics print the same numbers. */
function totalsLines(
  path: string,
  options: ValidateCommandOptions,
): { ok: boolean; lines: string[] } {
  const measured = measureDesignFile(options, path);
  if (!measured.ok) return { ok: false, lines: measured.error };
  const { report, terrainSource } = measured.value;
  return { ok: true, lines: [`Totals on ${terrainSource}:`, ...costAndPlotLines(report)] };
}

/** Runs the validate command and returns its exit code. File access is injected for tests. */
export function runValidate(options: ValidateCommandOptions): number {
  const [path] = options.args;
  if (path === undefined) {
    options.print('Usage: validate <design.json>');
    return USAGE_EXIT_CODE;
  }
  const text = readFile(options, path);
  if (!text.ok) {
    text.error.forEach(options.print);
    return 1;
  }
  const report = validateDesignText(text.value, options.catalog);
  reportLines(path, report).forEach(options.print);
  if (report.kind !== 'valid') return 1;
  const totals = totalsLines(path, options);
  totals.lines.forEach(options.print);
  return totals.ok ? 0 : 1;
}
