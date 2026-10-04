import { countByCategory, elementCategories } from '../elements.js';
import type { HeatmapCategory } from '../heatmaps.js';

import type { ExportInput, RankedInsightDesign } from './top-designs.js';

const SCORE_DECIMALS = 3;
const LINE_END = '\r\n';

const COUNT_COLUMNS: readonly (readonly [string, HeatmapCategory])[] = [
  ['paths', 'path'],
  ['trees', 'tree'],
  ['seating', 'seating'],
  ['play', 'play'],
  ['gardens', 'garden'],
  ['dog_areas', 'dog'],
];

export const CSV_HEADER: readonly string[] = [
  'rank',
  'design_id',
  'title',
  'score',
  'votes_up',
  'votes_down',
  'net_earthworks_m3',
  ...COUNT_COLUMNS.map(([column]) => column),
];

// A leading =, +, - or @ makes a spreadsheet run the cell as a formula.
const FORMULA_START = /^[=+\-@]/;
const NEEDS_QUOTES = /[",\r\n]/;

/** Quotes a text field when needed and defuses spreadsheet formulas in user text. */
function textField(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) || safe !== value ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function row(entry: RankedInsightDesign, input: ExportInput): string {
  const { design } = entry;
  const counts = countByCategory(elementCategories(design.document, input.catalog), 'all');
  return [
    String(entry.rank),
    textField(design.id),
    textField(design.title),
    entry.score.toFixed(SCORE_DECIMALS),
    String(design.up),
    String(design.down),
    design.metrics === null ? '' : String(design.metrics.netM3),
    ...COUNT_COLUMNS.map(([, category]) => String(counts.get(category) ?? 0)),
  ].join(',');
}

/** The top designs as CSV, one line per design after the header. */
export function* csvChunks(input: ExportInput): Generator<string> {
  yield CSV_HEADER.join(',') + LINE_END;
  for (const entry of input.designs) yield row(entry, input) + LINE_END;
}
