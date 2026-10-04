import type { components } from '@parkshape/api-client';
import type { Heightmap } from '@parkshape/core';

export type ProjectTerrain = components['schemas']['ProjectTerrain'];

const LITTLE_ENDIAN = true;

/** Base64 float32 little-endian elevations, as the API sends them, back into a grid. */
export function heightmapOf(terrain: ProjectTerrain): Heightmap {
  const text = atob(terrain.elevations);
  const bytes = Uint8Array.from(text, (character) => character.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const elevations = Float32Array.from(
    { length: bytes.byteLength / Float32Array.BYTES_PER_ELEMENT },
    (_, index) => view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, LITTLE_ENDIAN),
  );
  const { width, height, resolutionM, originLocal } = terrain;
  return { width, height, resolutionM, originLocal, elevations };
}

/** The grid as the API sends it: float32 little-endian elevations in base64. */
export function terrainOf(heightmap: Heightmap): ProjectTerrain {
  const view = new DataView(
    new ArrayBuffer(heightmap.elevations.length * Float32Array.BYTES_PER_ELEMENT),
  );
  heightmap.elevations.forEach((value, index) => {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, value, LITTLE_ENDIAN);
  });
  const text = Array.from(new Uint8Array(view.buffer), (byte) => String.fromCharCode(byte)).join(
    '',
  );
  const { width, height, resolutionM, originLocal } = heightmap;
  return { width, height, resolutionM, originLocal, elevations: btoa(text), source: 'stored' };
}
