import {
  designDocumentSchema,
  itemIdSchema,
  type DesignDocument,
  type DesignDocumentInput,
} from '@parkshape/core';

type Parts = Partial<Omit<DesignDocumentInput, 'version'>>;

/** A parsed design built from the parts a test cares about. Shared by the editor tests only. */
export function docOf(parts: Parts = {}): DesignDocument {
  return designDocumentSchema.parse({
    version: 1,
    items: parts.items ?? [],
    paths: parts.paths ?? [],
    areas: parts.areas ?? [],
    gradeDelta: parts.gradeDelta ?? { cells: [] },
    zones: parts.zones ?? [],
  });
}

export function treeInput(id: string, x: number, y: number, locked: 'locked' | 'free' = 'free') {
  return {
    id,
    catalogId: 'bigleaf-maple',
    position: { x, y },
    rotationDeg: 0,
    locked: locked === 'locked',
  };
}

interface Point {
  x: number;
  y: number;
}

export function square(minX: number, minY: number, side: number): [Point, Point, Point, Point] {
  return [
    { x: minX, y: minY },
    { x: minX + side, y: minY },
    { x: minX + side, y: minY + side },
    { x: minX, y: minY + side },
  ];
}

export const itemId = (id: string) => itemIdSchema.parse(id);
