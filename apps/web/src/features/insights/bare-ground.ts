import type { DesignDocument } from '@parkshape/core';

/**
 * The park with nothing placed on it, for Hide items: no items, paths or areas, so no models,
 * path ribbons, garden beds, area fills or water draw. The ground shape and the zones stay.
 * Garden beds are painted into the terrain from the areas, so clearing the items alone left them.
 */
export function bareGround(document: DesignDocument): DesignDocument {
  return { ...document, items: [], paths: [], areas: [] };
}
