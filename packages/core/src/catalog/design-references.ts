import type { GeometryKind } from '../schema/catalog.js';
import type { DesignDocument } from '../schema/design.js';
import type { CatalogId, ItemId } from '../schema/ids.js';

import type { CatalogIndex } from './catalog.js';

export type CatalogIssue =
  | { readonly kind: 'unknownCatalogId'; readonly elementId: ItemId; readonly catalogId: CatalogId }
  | {
      readonly kind: 'wrongGeometryKind';
      readonly elementId: ItemId;
      readonly catalogId: CatalogId;
      readonly expected: GeometryKind;
      readonly actual: GeometryKind;
    }
  | { readonly kind: 'duplicateElementId'; readonly elementId: ItemId };

interface CatalogReference {
  readonly elementId: ItemId;
  readonly catalogId: CatalogId;
  readonly expected: GeometryKind;
}

function referenceIssues(reference: CatalogReference, catalog: CatalogIndex): CatalogIssue[] {
  const { elementId, catalogId, expected } = reference;
  const entry = catalog.get(catalogId);
  if (entry === undefined) return [{ kind: 'unknownCatalogId', elementId, catalogId }];
  if (entry.geometryKind !== expected) {
    return [
      { kind: 'wrongGeometryKind', elementId, catalogId, expected, actual: entry.geometryKind },
    ];
  }
  return [];
}

function duplicateIdIssues(design: DesignDocument): CatalogIssue[] {
  const ids = [design.items, design.paths, design.areas, design.zones].flatMap((elements) =>
    elements.map((element) => element.id),
  );
  const repeated = new Set(ids.filter((id, index) => ids.indexOf(id) !== index));
  return [...repeated].map((elementId) => ({ kind: 'duplicateElementId', elementId }));
}

/**
 * Checks what the schema cannot: that items and areas name catalog entries of the right
 * geometry kind, and that element ids are unique across the document.
 */
export function validateDesignAgainstCatalog(
  design: DesignDocument,
  catalog: CatalogIndex,
): CatalogIssue[] {
  const references: CatalogReference[] = [
    ...design.items.map((item) => ({
      elementId: item.id,
      catalogId: item.catalogId,
      expected: 'point' as const,
    })),
    ...design.areas.map((area) => ({
      elementId: area.id,
      catalogId: area.catalogId,
      expected: 'area' as const,
    })),
  ];
  return [
    ...references.flatMap((reference) => referenceIssues(reference, catalog)),
    ...duplicateIdIssues(design),
  ];
}
