import { z } from 'zod';

import {
  categorySchema,
  compassZoneSchema,
  type CatalogItem,
  type Category,
  type CompassZone,
} from '@parkshape/core';

import type { ItemsListRow } from '../editor/items-list.js';

import { fill, formatMetres, type EditorStrings } from './strings.js';

const THIRDS = 3;

const ZONE_GRID: readonly (readonly CompassZone[])[] = [
  ['south-west', 'south', 'south-east'],
  ['west', 'centre', 'east'],
  ['north-west', 'north', 'north-east'],
];

/** Place words the app may add to its itemsList strings; without them rows show coordinates. */
const placeStringsSchema = z.object({
  place: z.string(),
  placeOfMany: z.string(),
  zones: z.record(compassZoneSchema, z.string()),
});

type PlaceStrings = z.infer<typeof placeStringsSchema>;

function thirdOf(value: number, max: number): number {
  const index = max <= 0 ? 1 : Math.floor((value / max) * THIRDS);
  return Math.min(Math.max(index, 0), THIRDS - 1);
}

/**
 * Positions are in the parcel's local frame, whose origin is the south-west corner of the
 * parcel's bounds, so the far extent of the listed elements stands in for the parcel's.
 */
function zonesOf(rows: readonly ItemsListRow[]): CompassZone[] {
  const maxX = Math.max(0, ...rows.map((row) => row.x));
  const maxY = Math.max(0, ...rows.map((row) => row.y));
  return rows.map((row) => ZONE_GRID[thirdOf(row.y, maxY)]?.[thirdOf(row.x, maxX)] ?? 'centre');
}

function placeLabels(rows: readonly ItemsListRow[], names: readonly string[], words: PlaceStrings) {
  const zones = zonesOf(rows).map((zone) => words.zones[zone]);
  const keys = names.map((name, index) => `${name}|${zones[index] ?? ''}`);
  const totals = new Map<string, number>();
  keys.forEach((key) => totals.set(key, (totals.get(key) ?? 0) + 1));
  const seen = new Map<string, number>();
  return keys.map((key, index) => {
    const count = totals.get(key) ?? 1;
    const place = { name: names[index] ?? '', zone: zones[index] ?? '' };
    if (count === 1) return fill(words.place, place);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    return fill(words.placeOfMany, { ...place, index: seen.get(key) ?? 1, count });
  });
}

/** Each row's catalog name in the app's words. */
export function rowNames(rows: readonly ItemsListRow[], strings: EditorStrings): string[] {
  return rows.map((row) => strings.catalog[row.catalogId] ?? row.catalogId);
}

/** Each row's name with its place in the park, counted when several share a zone. */
export function rowLabels(rows: readonly ItemsListRow[], strings: EditorStrings): string[] {
  const names = rowNames(rows, strings);
  const words = placeStringsSchema.safeParse(strings.itemsList);
  if (words.success) return placeLabels(rows, names, words.data);
  return rows.map((row, index) => {
    const position = fill(strings.itemsList.position, {
      x: formatMetres(row.x),
      y: formatMetres(row.y),
    });
    return `${names[index] ?? row.catalogId} ${position}`;
  });
}

export interface LabelledRow {
  readonly row: ItemsListRow;
  readonly label: string;
}

export interface ItemsListGroup {
  readonly category: Category;
  readonly rows: readonly LabelledRow[];
}

const collator = new Intl.Collator('en', { numeric: true });

/** Name first, then the rest of the label, which is the place and its count. */
function byNameThenPlace(a: LabelledRow & { name: string }, b: LabelledRow & { name: string }) {
  return collator.compare(a.name, b.name) || collator.compare(a.label, b.label);
}

/**
 * Rows under their catalog category, in the category order of the schema. Within a category the
 * rows go by name, then by place, so the rows for one kind of tree sit together.
 */
export function groupRows(
  rows: readonly ItemsListRow[],
  labels: readonly string[],
  catalog: readonly CatalogItem[],
  names: readonly string[],
): ItemsListGroup[] {
  const categoryOf = new Map<string, Category>(catalog.map((entry) => [entry.id, entry.category]));
  const labelled = rows.map((row, index) => ({
    row,
    label: labels[index] ?? row.id,
    name: names[index] ?? row.catalogId,
  }));
  return categorySchema.options
    .map((category) => ({
      category,
      rows: labelled
        .filter((entry) => categoryOf.get(entry.row.catalogId) === category)
        .sort(byNameThenPlace)
        .map(({ row, label }) => ({ row, label })),
    }))
    .filter((group) => group.rows.length > 0);
}
