import {
  catalogIndex,
  isExistingFeatureId,
  type Category,
  type DesignDocument,
} from '@parkshape/core';

import type { DesignDigest } from './types.js';

export interface DigestSource {
  readonly id: string;
  readonly score: number;
  readonly document: DesignDocument;
}

/**
 * Reduces a design to category counts, the only part of a design a summary prompt sees. Features
 * of the park as it is today are left out: every fork of the baseline has them, so counting them
 * would make the existing washroom or garden a theme of every design.
 */
export function digestDesign(source: DigestSource): DesignDigest {
  const counts: Partial<Record<Category, number>> = {};
  const add = (category: Category) => {
    counts[category] = (counts[category] ?? 0) + 1;
  };
  const { items, areas, paths } = source.document;
  for (const { id, catalogId } of [...items, ...areas]) {
    if (isExistingFeatureId(id)) continue;
    const item = catalogIndex.get(catalogId);
    if (item !== undefined) add(item.category);
  }
  paths.forEach(() => {
    add('path');
  });
  return { id: source.id, score: source.score, categoryCounts: counts };
}
