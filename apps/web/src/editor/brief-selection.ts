import { catalogIndex, type CatalogIndex } from '@parkshape/core';
import type { EditorState } from '@parkshape/scene/editor';

import { messages } from '../messages';

/** The one selected item, as the brief panel names it. */
export interface BriefSelection {
  readonly name: string;
  readonly kind: string;
  readonly costCad: number;
}

type SelectionState = Pick<EditorState, 'selection'> & {
  readonly document: Pick<EditorState['document'], 'items'>;
};

/** The single selected item with its name, kind and unit cost, or null for none or many. */
export function selectedForBrief(
  state: SelectionState,
  catalog: CatalogIndex = catalogIndex,
): BriefSelection | null {
  const [only, ...others] = state.selection;
  if (only?.kind !== 'item' || others.length > 0) return null;
  const item = state.document.items.find((entry) => entry.id === only.id);
  const entry = item === undefined ? undefined : catalog.get(item.catalogId);
  if (entry === undefined) return null;
  const catalogNames: Readonly<Record<string, string>> = messages.catalog;
  return {
    name: catalogNames[entry.id] ?? entry.name,
    kind: messages.editor.categories[entry.category],
    costCad: entry.unitCost.perItemCad ?? 0,
  };
}

const SENTENCE_END = /(?<=[.?!])\s+/;
const PLURAL_END = /s$/;

/** Sentences of the brief that mention the selected item by name or by kind. */
export function briefSentencesAbout(brief: string, selected: BriefSelection): string[] {
  const words = [selected.name, selected.kind.replace(PLURAL_END, '')].map((word) =>
    word.toLowerCase(),
  );
  return brief
    .split(SENTENCE_END)
    .map((sentence) => sentence.trim())
    .filter((sentence) => words.some((word) => sentence.toLowerCase().includes(word)));
}
