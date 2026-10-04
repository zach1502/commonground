import { makeFlatHeightmap, parcelGrid, type Heightmap, type Parcel } from '@parkshape/core';
import type { Project } from '@parkshape/db';
import type { BlobStore } from '@parkshape/storage';
import { readStoredHeightmap } from '@parkshape/terrain';

import { fromBlobStore } from '../errors.js';

/** Where the terrain for a submission came from; stored in the metrics payload. */
export type HeightmapSource = 'stored' | 'flat';

export interface ProjectTerrain {
  readonly heightmap: Heightmap;
  readonly source: HeightmapSource;
  /**
   * The heightmapRef of a stored heightmap, so the metrics workers keep it between submits.
   * Terrain builds write each heightmap under a fresh blob id, so one ref is one set of heights.
   * A flat grid has no key and is sent with every job.
   */
  readonly key?: string | undefined;
}

const DATA_EXTENSION = /\.bin$/;

/** heightmapRef names the float32 data blob; its header sits beside it with a .json extension. */
export function heightmapBaseKey(heightmapRef: string): string {
  return heightmapRef.replace(DATA_EXTENSION, '');
}

/**
 * The project's stored heightmap, or a flat grid over the parcel when none has been stored yet.
 * A stored heightmap that does not decode is an error: metrics on the wrong terrain are worse
 * than no metrics.
 */
export async function loadProjectTerrain(
  blobStore: BlobStore,
  project: Project,
  parcel: Parcel,
): Promise<ProjectTerrain> {
  // A store that does not answer is a 503; a heightmap it returns that does not parse is a bug.
  const baseKey = heightmapBaseKey(project.heightmapRef);
  const read = await fromBlobStore(() => readStoredHeightmap(blobStore, baseKey));
  switch (read.kind) {
    case 'found':
      return { heightmap: read.result.heightmap, source: 'stored', key: project.heightmapRef };
    case 'missing':
      return { heightmap: makeFlatHeightmap(parcelGrid(parcel)), source: 'flat' };
    case 'invalid':
      throw new Error(`Project ${project.id} heightmap is unreadable: ${read.reason}`);
  }
}
