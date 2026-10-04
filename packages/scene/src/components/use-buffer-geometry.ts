import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';

import type { MeshArrays } from '../types.js';

const VECTOR_SIZE = 3;

/** Wraps mesh arrays in a BufferGeometry and frees it when the arrays change or unmount. */
export function useBufferGeometry(arrays: MeshArrays): BufferGeometry {
  const geometry = useMemo(() => {
    const built = new BufferGeometry();
    built.setAttribute('position', new BufferAttribute(arrays.positions, VECTOR_SIZE));
    built.setAttribute('normal', new BufferAttribute(arrays.normals, VECTOR_SIZE));
    built.setIndex(new BufferAttribute(arrays.indices, 1));
    built.computeBoundingSphere();
    return built;
  }, [arrays]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  return geometry;
}
