import { formatPercentValue, HEATMAP_GROUPS, type HeatmapLayer } from '@parkshape/core';
import type { Bar, HistogramBin, SegmentOption } from '@parkshape/ui';

import type { Insights } from '../../api/staff-api';
import { format, messages } from '../../messages';
import { pluralise } from '../../plural';

type Features = Insights['features'];
type Category = Features[number]['category'];
type Reason = Insights['reasons']['overall'][number]['reason'];
type ConstraintKey = Insights['compliance'][number]['key'];

const text = messages.insights;
const categoryName = (category: Category) =>
  messages.planner.parameters.counts.categories[category];
const reasonName = (reason: Reason) => messages.vote.reasons[reason];
const ruleName = (key: ConstraintKey) => messages.planner.parameters.severity.keys[key];
// The six features the engagement plan names; the chart shows them even at zero.
const MAIN_CATEGORIES: readonly string[] = ['path', 'tree', 'seating', 'play', 'garden', 'dog'];
const AVERAGE_DECIMALS = 1;
const FULL_PERCENT = 100;

export interface HeadlineItem {
  readonly id: keyof Insights['headline'];
  readonly term: string;
  readonly value: string;
}

/** The three counts, in the order DESIGN.md sets. */
export function headlineItems(headline: Insights['headline']): HeadlineItem[] {
  const ids = ['designsSubmitted', 'uniqueVoters', 'votesCast'] as const;
  return ids.map((id) => ({ id, term: text.headline[id], value: String(headline[id]) }));
}

/** The six mapped features always, then any other feature at least 1 design has. */
function shownFeatures(features: Features): Features {
  return features.filter(
    (row) => MAIN_CATEGORIES.includes(row.category) || row.designsWithPercent > 0,
  );
}

export function featureShareBars(features: Features): Bar[] {
  return shownFeatures(features).map((row) => ({
    id: row.category,
    label: categoryName(row.category),
    value: row.designsWithPercent,
  }));
}

export const percentText = (value: number) => formatPercentValue(value);
export const averageText = (value: number) => value.toFixed(AVERAGE_DECIMALS);

/** Designs with a feature, from its share; the API sends the share, never the count. */
const designsWith = (percent: number, designs: number) =>
  Math.round((percent / FULL_PERCENT) * designs);

/**
 * One bar per feature, most used first: its share of designs, with the count of designs and the
 * average named beside it. A tie keeps catalog order, because the sort is stable.
 */
export function featureBars(features: Features, designs: number): Bar[] {
  return [...shownFeatures(features)]
    .sort((a, b) => b.designsWithPercent - a.designsWithPercent)
    .map((row) => ({
      id: row.category,
      label: categoryName(row.category),
      value: row.designsWithPercent,
      valueText: format(text.features.valueText, {
        count: designsWith(row.designsWithPercent, designs),
        total: designs,
        average: averageText(row.averageCount),
      }),
    }));
}

/** Bars with a value, and the zero rows that wait behind Show all. */
export function splitZeroBars(bars: readonly Bar[]): { shown: Bar[]; zero: Bar[] } {
  return {
    shown: bars.filter((bar) => bar.value > 0),
    zero: bars.filter((bar) => bar.value <= 0),
  };
}

/** A percent as a bare number for a table cell; the column header carries the "%". */
const percentCell = (value: number) => percentText(value).replace('%', '');

/**
 * The reasons named with up votes or with down votes, most named first; the catch-all Other stays
 * last, ties go by name.
 */
export function reasonBars(reasons: Insights['reasons'], side: 'up' | 'down'): Bar[] {
  const rank = (id: string, value: number) => (id === 'other' ? -1 : value);
  return reasons[side]
    .map((row) => ({ id: row.reason, label: reasonName(row.reason), value: row.count }))
    .sort(
      (a, b) => rank(b.id, b.value) - rank(a.id, a.value) || a.label.localeCompare(b.label, 'en'),
    );
}

export interface DesignReasonRow {
  readonly id: string;
  readonly title: string;
  readonly votes: number;
  readonly named: string;
}

/** Each design's named reasons as one line, most named first; reasons nobody named are left out. */
export function designReasonRows(reasons: Insights['reasons']): DesignReasonRow[] {
  return reasons.byDesign.map((design) => {
    const named = design.counts
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((row) =>
        format(text.reasons.reasonCount, { reason: reasonName(row.reason), count: row.count }),
      );
    return {
      id: design.designId,
      title: design.title,
      votes: design.votes,
      named: named.length === 0 ? text.reasons.none : named.join(', '),
    };
  });
}

export function complianceRows(compliance: Insights['compliance']) {
  return compliance.map((row) => ({ ...row, label: ruleName(row.key) }));
}

export function earthworksBins(earthworks: Insights['earthworks']): HistogramBin[] {
  return earthworks.bins.map((bin) => ({
    id: String(bin.fromM3),
    label: format(text.earthworks.bin, { from: bin.fromM3, to: bin.toM3 }),
    count: bin.count,
  }));
}

/** "Garry oak in the north", with "1 of 2" added when two features share that label. */
function placeLabels(diff: Insights['baselineDiff']): string[] {
  const t = text.baseline;
  const labels = diff.map((row) => format(t.row, { name: row.label, where: t.where[row.where] }));
  const totals = new Map<string, number>();
  labels.forEach((label) => totals.set(label, (totals.get(label) ?? 0) + 1));
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const total = totals.get(label) ?? 1;
    if (total === 1) return label;
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return format(t.repeat, { label, n, total });
  });
}

export type BaselineRow =
  | {
      readonly kind: 'changed';
      readonly id: string;
      readonly label: string;
      readonly moved: string;
      readonly removed: string;
      readonly resized: string;
    }
  | { readonly kind: 'unchanged'; readonly id: 'unchanged'; readonly label: string };

const unchangedEverywhere = (row: Insights['baselineDiff'][number]) =>
  row.movedPercent === 0 && row.removedPercent === 0 && row.resizedPercent === 0;

/** Features some design changed, then one row that counts the features no design touched. */
export function baselineRows(diff: Insights['baselineDiff']): BaselineRow[] {
  const labels = placeLabels(diff);
  const changed = diff.flatMap((row, index): BaselineRow[] =>
    unchangedEverywhere(row)
      ? []
      : [
          {
            kind: 'changed',
            id: row.featureId,
            label: labels[index] ?? row.label,
            moved: percentCell(row.movedPercent),
            removed: percentCell(row.removedPercent),
            resized: percentCell(row.resizedPercent),
          },
        ],
  );
  const unchanged = diff.length - changed.length;
  if (unchanged === 0) return changed;
  const label = pluralise(unchanged, text.baseline.unchanged);
  return [...changed, { kind: 'unchanged', id: 'unchanged', label }];
}

interface EngagementCell<Group extends string> {
  readonly group: Group | null;
  readonly count: number | null;
  readonly suppressed: boolean;
}

export interface EngagementRow {
  readonly id: string;
  readonly group: string;
  readonly people: string;
}

/** Suppressed groups read "under 5"; the server never sends their count. */
export function engagementRows<Group extends string>(
  cells: readonly EngagementCell<Group>[],
  nameOf: (group: Group) => string,
): EngagementRow[] {
  return cells.map((cell) => ({
    id: cell.group ?? 'none',
    group: cell.group === null ? text.engagement.notAnswered : nameOf(cell.group),
    people:
      cell.suppressed || cell.count === null ? text.engagement.suppressed : String(cell.count),
  }));
}

/** The switcher's groups: core's paths and grading, then its features split by kind. */
type SwitcherGroupId = 'pathsAndGrading' | 'planting' | 'places' | 'services';

type FeatureKind = Exclude<SwitcherGroupId, 'pathsAndGrading'>;

const FEATURE_KINDS: Readonly<Record<FeatureKind, readonly HeatmapLayer[]>> = {
  planting: ['tree', 'shrub', 'garden', 'ground'],
  places: ['play', 'seating', 'dog', 'sports', 'water', 'plaza'],
  services: ['lighting', 'washroom', 'parking', 'amenity'],
};
const KINDS = Object.keys(FEATURE_KINDS) as FeatureKind[];

/** A kind's layers in its own order; Services also takes any feature no kind lists. */
function layersOfKind(kind: FeatureKind, features: readonly HeatmapLayer[]): HeatmapLayer[] {
  const listed = FEATURE_KINDS[kind].filter((layer) => features.includes(layer));
  if (kind !== 'services') return listed;
  const kinded = new Set(KINDS.flatMap((id) => FEATURE_KINDS[id]));
  return [...listed, ...features.filter((layer) => !kinded.has(layer))];
}

export interface HeatmapOptionGroup {
  readonly id: SwitcherGroupId;
  readonly label: string;
  readonly options: readonly SegmentOption<HeatmapLayer>[];
}

function optionsOf(layers: readonly HeatmapLayer[]): SegmentOption<HeatmapLayer>[] {
  return layers.map((layer) => ({ value: layer, label: text.heatmap.layers[layer] }));
}

/**
 * The heatmap switcher with plain names: paths and grading, then the placed features in three
 * short rows by kind, so no row wraps at 1440 px. A feature with no kind joins Services.
 */
export function heatmapGroups(): HeatmapOptionGroup[] {
  const layersOf = (id: 'pathsAndGrading' | 'features') =>
    HEATMAP_GROUPS.find((group) => group.id === id)?.layers ?? [];
  const features = layersOf('features');
  return [
    {
      id: 'pathsAndGrading',
      label: text.heatmap.groups.pathsAndGrading,
      options: optionsOf(layersOf('pathsAndGrading')),
    },
    ...KINDS.map((kind) => ({
      id: kind,
      label: text.heatmap.groups[kind],
      options: optionsOf(layersOfKind(kind, features)),
    })),
  ];
}
