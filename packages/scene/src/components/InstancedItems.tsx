import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import { Mesh, MeshStandardMaterial } from 'three';
import type { Object3D } from 'three';

import type { InstanceGroup, InstanceTransform } from '../geometry/instances.js';
import { shadowRole } from '../geometry/shadow-casters.js';
import type { ShadowRole } from '../geometry/shadow-casters.js';
import type { ScenePalette } from '../palette/colours.js';
import { placeholderParts } from '../placeholders/shapes.js';
import type { AssetManifest } from '../types.js';

import { InstancedPart, placeholderGeometry } from './InstancedPart.js';

interface PlaceholderInstancesProps {
  readonly group: InstanceGroup;
  readonly palette: ScenePalette;
}

/** Stand-in primitives for a model that has no GLB in the manifest yet. */
function PlaceholderInstances({ group, palette }: PlaceholderInstancesProps): ReactElement {
  const parts = useMemo(
    () =>
      placeholderParts(group.category).map((part) => ({
        geometry: placeholderGeometry(part),
        material: new MeshStandardMaterial({ color: palette[part.colour], roughness: 0.9 }),
      })),
    [group.category, palette],
  );
  useEffect(
    () => () => {
      parts.forEach(({ geometry, material }) => {
        geometry.dispose();
        material.dispose();
      });
    },
    [parts],
  );
  return (
    <>
      {parts.map((part, index) => (
        <InstancedPart
          key={`${group.modelKey}-${String(index)}-${String(group.transforms.length)}`}
          geometry={part.geometry}
          material={part.material}
          transforms={group.transforms}
          shadow={shadowRole(group.category)}
        />
      ))}
    </>
  );
}

// three types a narrowed Mesh with any generics; the guard keeps the default ones.
function isMesh(node: Object3D): node is Mesh {
  return node instanceof Mesh;
}

interface ModelInstancesProps {
  readonly url: string;
  readonly transforms: readonly InstanceTransform[];
  readonly shadow: ShadowRole;
}

/**
 * Instances every mesh in a GLB; suspends while the file loads. The asset pipeline bakes the
 * authored transforms into the vertices, but quantization adds a uniform dequantization scale and
 * offset on each node, so every mesh keeps its world matrix under the placement.
 */
function ModelInstances({ url, transforms, shadow }: ModelInstancesProps): ReactElement {
  const { scene } = useGLTF(url);
  const meshes = useMemo(() => {
    const found: Mesh[] = [];
    scene.traverse((node) => {
      if (isMesh(node)) {
        found.push(node);
      }
    });
    scene.updateMatrixWorld(true);
    return found;
  }, [scene]);
  return (
    <>
      {meshes.map((mesh) => (
        <InstancedPart
          key={`${mesh.uuid}-${String(transforms.length)}`}
          geometry={mesh.geometry}
          material={mesh.material}
          transforms={transforms}
          modelMatrix={mesh.matrixWorld}
          shadow={shadow}
        />
      ))}
    </>
  );
}

export interface InstancedItemsProps {
  readonly groups: ReadonlyMap<string, InstanceGroup>;
  readonly palette: ScenePalette;
  readonly manifest?: AssetManifest | undefined;
}

/** Instanced draws per model key: the GLB meshes when the manifest has it, else a placeholder. */
export function InstancedItems({ groups, palette, manifest }: InstancedItemsProps): ReactElement {
  return (
    <>
      {[...groups.values()].map((group) => {
        const url = manifest?.[group.modelKey]?.url;
        return url === undefined ? (
          <PlaceholderInstances key={group.modelKey} group={group} palette={palette} />
        ) : (
          <ModelInstances
            key={group.modelKey}
            url={url}
            transforms={group.transforms}
            shadow={shadowRole(group.category)}
          />
        );
      })}
    </>
  );
}
