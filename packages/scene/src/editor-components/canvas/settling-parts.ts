import { Matrix4, Mesh, MeshStandardMaterial } from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';

import { placeholderGeometry } from '../../components/InstancedPart.js';
import type { ScenePalette } from '../../palette/colours.js';
import { placeholderParts } from '../../placeholders/shapes.js';
import type { ItemCategory } from '../../types.js';

/** One mesh of a settling item: the model's own geometry and material, and its model matrix. */
export interface SettlingPart {
  readonly geometry: BufferGeometry;
  readonly material: Material;
  readonly matrix: Matrix4;
}

const PLACEHOLDER_ROUGHNESS = 0.9;

function isMesh(node: Object3D): node is Mesh {
  return node instanceof Mesh;
}

// The settle draws the model's own opaque materials, never copies: a see-through copy needs its
// own shader program, and compiling it on the first settle took about 480 ms on software GL,
// which held up the meters. The placeholders are made once per category and kept.
const modelParts = new WeakMap<Object3D, readonly SettlingPart[]>();
const placeholders = new WeakMap<ScenePalette, Map<ItemCategory, readonly SettlingPart[]>>();

/** The parts of a loaded model, listed once per model. */
export function settlingModelParts(scene: Object3D): readonly SettlingPart[] {
  const found = modelParts.get(scene);
  if (found !== undefined) return found;
  scene.updateMatrixWorld(true);
  const parts: SettlingPart[] = [];
  scene.traverse((node) => {
    if (!isMesh(node)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      parts.push({
        geometry: node.geometry,
        material,
        matrix: node.matrixWorld,
      });
    });
  });
  modelParts.set(scene, parts);
  return parts;
}

/** The stand-in parts for a model with no GLB, made once per category. */
export function settlingPlaceholderParts(
  category: ItemCategory,
  palette: ScenePalette,
): readonly SettlingPart[] {
  const byCategory = placeholders.get(palette) ?? new Map<ItemCategory, readonly SettlingPart[]>();
  placeholders.set(palette, byCategory);
  const found = byCategory.get(category);
  if (found !== undefined) return found;
  const parts = placeholderParts(category).map((part) => ({
    geometry: placeholderGeometry(part),
    material: new MeshStandardMaterial({
      color: palette[part.colour],
      roughness: PLACEHOLDER_ROUGHNESS,
    }),
    matrix: new Matrix4(),
  }));
  byCategory.set(category, parts);
  return parts;
}
