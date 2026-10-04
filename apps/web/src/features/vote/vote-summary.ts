import { catalogIndex, designDocumentSchema, type Category } from '@parkshape/core';

import type { Design } from '../../api/web-api';
import { contentsSentence, costSentence, type CategoryCount } from '../../design/design-facts';
import { messages } from '../../messages';

/** Item and area counts by category, the same breakdown the design page legend reads. */
function categoryCounts(design: Design): CategoryCount[] {
  const document = designDocumentSchema.parse(design.document);
  const counts = new Map<Category, number>();
  const bump = (category: Category) => counts.set(category, (counts.get(category) ?? 0) + 1);
  document.items.forEach((item) => bump(catalogIndex.get(item.catalogId)?.category ?? 'ground'));
  document.areas.forEach((area) => bump(catalogIndex.get(area.catalogId)?.category ?? 'garden'));
  return [...counts.entries()].map(([category, count]) => ({ category, count }));
}

/**
 * The text alternative for the read-only 3D view of a design: the items by kind and count, then
 * the cost. Used until the scene component exposes its own description. An empty design reads a
 * plain note so the view is never unlabelled.
 */
export function voteViewSummary(design: Design): string {
  const contents = contentsSentence(categoryCounts(design));
  const cost = costSentence(design.metrics?.totals ?? null);
  const sentences = [contents, cost].filter((part): part is string => part !== null);
  return sentences.length === 0 ? messages.vote.noPoster : sentences.join(' ');
}
