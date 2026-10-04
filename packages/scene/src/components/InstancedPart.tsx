import { useLayoutEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { BoxGeometry, Color, CylinderGeometry, Matrix4, SphereGeometry } from 'three';
import type { BufferGeometry, InstancedMesh, Material } from 'three';

import { instanceMatrix } from '../geometry/instances.js';
import type { InstanceTransform } from '../geometry/instances.js';
import type { PlaceholderPart } from '../placeholders/shapes.js';

const HALF = 0.5;
const ROUND_SEGMENTS = 12;
const SPHERE_RINGS = 8;

/** Primitive geometry for a stand-in part, moved up so it stands on the instance origin. */
export function placeholderGeometry(part: PlaceholderPart): BufferGeometry {
  const { shape } = part;
  if (shape.kind === 'box') {
    return new BoxGeometry(shape.widthM, shape.heightM, shape.depthM).translate(
      0,
      part.baseY + shape.heightM * HALF,
      0,
    );
  }
  if (shape.kind === 'cylinder') {
    return new CylinderGeometry(
      shape.radiusM,
      shape.radiusM,
      shape.heightM,
      ROUND_SEGMENTS,
    ).translate(0, part.baseY + shape.heightM * HALF, 0);
  }
  return new SphereGeometry(shape.radiusM, ROUND_SEGMENTS, SPHERE_RINGS).translate(
    0,
    part.baseY + shape.radiusM,
    0,
  );
}

export interface InstancedPartProps {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
  readonly transforms: readonly InstanceTransform[];
  /** Model-space matrix applied before each placement, such as a GLB's dequantization node. */
  readonly modelMatrix?: Matrix4 | undefined;
  /** 'cast' draws into the shadow map and receives; 'receive' only receives; 'none' neither. */
  readonly shadow?: PartShadow | undefined;
}

export type PartShadow = 'cast' | 'receive' | 'none';

/** One InstancedMesh with a matrix per transform; each matrix has a uniform scale. */
export function InstancedPart({
  geometry,
  material,
  transforms,
  modelMatrix,
  shadow = 'cast',
}: InstancedPartProps): ReactElement {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (mesh === null) {
      return;
    }
    const matrix = new Matrix4();
    transforms.forEach((transform, index) => {
      matrix.fromArray(instanceMatrix(transform));
      if (modelMatrix !== undefined) {
        matrix.multiply(modelMatrix);
      }
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (transforms.some((transform) => (transform.tint ?? 0) !== 0)) {
      const colour = new Color();
      transforms.forEach((transform, index) => {
        const lightness = 1 + (transform.tint ?? 0);
        mesh.setColorAt(index, colour.setRGB(lightness, lightness, lightness));
      });
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }, [transforms, modelMatrix]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, transforms.length]}
      castShadow={shadow === 'cast'}
      receiveShadow={shadow !== 'none'}
    />
  );
}
