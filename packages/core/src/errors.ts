import type { CatalogIssue } from './catalog/design-references.js';
import type { CatalogId, ItemId } from './schema/ids.js';
import type { ConstraintKey } from './schema/parameters.js';

export type HeightmapIssue =
  | { readonly kind: 'elevationCount'; readonly expected: number; readonly actual: number }
  | {
      readonly kind: 'gridSize';
      readonly width: number;
      readonly height: number;
      readonly resolutionM: number;
    };

/** A path whose surface has no path entry in the catalog. */
export interface PathSurfaceIssue {
  readonly kind: 'unknownPathSurface';
  readonly elementId: ItemId;
  readonly catalogId: CatalogId;
}

export type DocumentIssue = CatalogIssue | HeightmapIssue | PathSurfaceIssue;

/** The inputs cannot be measured, so no report exists. */
export interface InvalidDocument {
  readonly kind: 'invalidDocument';
  readonly issues: readonly DocumentIssue[];
}

/** The report has hard constraints that fail, so the design cannot be submitted. */
export interface ConstraintViolation {
  readonly kind: 'constraintViolation';
  readonly failed: readonly ConstraintKey[];
}

export type CoreError = InvalidDocument | ConstraintViolation;

export function invalidDocument(issues: readonly DocumentIssue[]): InvalidDocument {
  return { kind: 'invalidDocument', issues };
}

export function constraintViolation(failed: readonly ConstraintKey[]): ConstraintViolation {
  return { kind: 'constraintViolation', failed };
}
