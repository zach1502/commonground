import type { Document, Node } from '@gltf-transform/core';
import {
  clearNodeTransform,
  dedup,
  flatten,
  getBounds,
  join,
  meshopt,
  prune,
  quantize,
  simplify,
  transformMesh,
  weld,
} from '@gltf-transform/functions';

import type { ScalePolicy } from '@parkshape/core';

import type { FittedAxis, ModelEntry } from './manifest-schema.js';
import type { Dims } from './targets.js';

type Mat4 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const TRIANGLE_MODE = 4;
const CORNERS_PER_TRIANGLE = 3;
const HALF = 0.5;
const DEGREES_PER_HALF_TURN = 180;
// Simplify raises the error limit by this factor until the model meets its budget.
const ERROR_GROWTH = 2;
const MAX_SIMPLIFY_ERROR = 0.2;

function affine(
  linear: readonly [number, number, number, number],
  translation: readonly [number, number, number],
): Mat4 {
  const [xx, xz, zx, zz] = linear;
  const [tx, ty, tz] = translation;
  return [xx, 0, xz, 0, 0, 1, 0, 0, zx, 0, zz, 0, tx, ty, tz, 1];
}

function uniformScaleMatrix(factor: number): Mat4 {
  return [factor, 0, 0, 0, 0, factor, 0, 0, 0, 0, factor, 0, 0, 0, 0, 1];
}

function listMeshNodes(document: Document): Node[] {
  return document
    .getRoot()
    .listNodes()
    .filter((node) => node.getMesh() !== null);
}

function transformAllMeshes(document: Document, matrix: Mat4): void {
  document
    .getRoot()
    .listMeshes()
    .forEach((mesh) => {
      transformMesh(mesh, matrix);
    });
}

export interface Bounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly dims: Dims;
}

/** Axis-aligned bounds of the default scene, with x as width, z as depth and y as height. */
export function measureBounds(document: Document): Bounds {
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  if (scene === undefined) {
    throw new Error('The model has no scene');
  }
  const { min, max } = getBounds(scene);
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    dims: { widthM: maxX - minX, depthM: maxZ - minZ, heightM: maxY - minY },
  };
}

/**
 * Flattens the node tree, moves every node transform into the vertices, turns the model about y
 * and joins primitives that share a material, so later steps work on bare vertices.
 */
export async function bakeNodeTransforms(document: Document, yawDeg: number): Promise<void> {
  await document.transform(flatten());
  listMeshNodes(document).forEach((node) => clearNodeTransform(node));
  if (yawDeg !== 0) {
    const angle = (yawDeg / DEGREES_PER_HALF_TURN) * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    transformAllMeshes(document, affine([cos, -sin, sin, cos], [0, 0, 0]));
  }
  await document.transform(dedup(), join(), prune());
}

export interface Fit {
  readonly factor: number;
  readonly fittedAxis: FittedAxis;
}

function fitFor(model: Dims, target: Dims, policy: ScalePolicy): Fit {
  const axes: readonly FittedAxis[] =
    policy === 'fixed' ? ['widthM', 'depthM', 'heightM'] : ['widthM', 'depthM'];
  if (policy === 'fixed') {
    const fittedAxis = axes.reduce((best, axis) => (target[axis] > target[best] ? axis : best));
    return { factor: target[fittedAxis] / model[fittedAxis], fittedAxis };
  }
  // The smaller factor keeps the other ground axis inside the module.
  return axes
    .map((axis) => ({ factor: target[axis] / model[axis], fittedAxis: axis }))
    .reduce((best, fit) => (fit.factor < best.factor ? fit : best));
}

/** Scales every mesh by one factor so the fitted axis matches the catalog size. */
export function rescaleToTarget(document: Document, target: Dims, policy: ScalePolicy): Fit {
  const fit = fitFor(measureBounds(document).dims, target, policy);
  transformAllMeshes(document, uniformScaleMatrix(fit.factor));
  return fit;
}

/** Moves the vertices so the lowest point sits on y = 0 and the footprint is centred on x and z. */
export function centerOnGround(document: Document): void {
  const { min, max } = measureBounds(document);
  const centreX = (min[0] + max[0]) * HALF;
  const centreZ = (min[2] + max[2]) * HALF;
  transformAllMeshes(document, affine([1, 0, 0, 1], [-centreX, -min[1], -centreZ]));
}

/** Merges vertices that share every attribute, so simplify can collapse edges across them. */
export async function weldModel(document: Document): Promise<void> {
  await document.transform(weld());
}

/** Triangles drawn by the scene, counting a mesh once for each node that uses it. */
export function countTriangles(document: Document): number {
  return listMeshNodes(document).reduce((total, node) => {
    const primitives = node.getMesh()?.listPrimitives() ?? [];
    return (
      total +
      primitives
        .filter((primitive) => primitive.getMode() === TRIANGLE_MODE)
        .reduce((sum, primitive) => {
          const corners =
            primitive.getIndices()?.getCount() ??
            primitive.getAttribute('POSITION')?.getCount() ??
            0;
          return sum + corners / CORNERS_PER_TRIANGLE;
        }, 0)
    );
  }, 0);
}

export interface SimplifyBudget {
  readonly budget: number;
  readonly error: number;
  readonly simplifier: unknown;
}

async function simplifyWithGrowingError(
  document: Document,
  options: SimplifyBudget,
): Promise<number> {
  let triangles = countTriangles(document);
  let error = options.error;
  while (triangles > options.budget && error <= MAX_SIMPLIFY_ERROR) {
    const ratio = options.budget / triangles;
    await document.transform(simplify({ simplifier: options.simplifier, ratio, error }));
    triangles = countTriangles(document);
    error *= ERROR_GROWTH;
  }
  return triangles;
}

// Flat shaded sources split every corner by normal, which locks the simplifier. Without normals
// the corners weld, and three.js shades a primitive with no normals flat, so the look holds.
async function dropNormalsAndWeld(document: Document): Promise<void> {
  document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .forEach((primitive) => primitive.setAttribute('NORMAL', null));
  await document.transform(weld(), prune());
}

/**
 * Simplifies toward the budget, raising the error limit until it fits, then retries without
 * normals if split normals kept it over. Returns the triangle count.
 */
export async function simplifyToBudget(
  document: Document,
  options: SimplifyBudget,
): Promise<number> {
  const triangles = await simplifyWithGrowingError(document, options);
  if (triangles <= options.budget) {
    return triangles;
  }
  await dropNormalsAndWeld(document);
  return simplifyWithGrowingError(document, options);
}

export type Compression = 'meshopt' | 'quantize';

/** EXT_meshopt_compression when the encoder loaded, else KHR_mesh_quantization alone. */
export async function compressModel(document: Document, encoder: unknown): Promise<Compression> {
  if (encoder === undefined) {
    await document.transform(quantize());
    return 'quantize';
  }
  await document.transform(meshopt({ encoder, level: 'medium' }));
  return 'meshopt';
}

/** Names of nodes whose scale differs between axes. The pipeline must never produce one. */
export function nonUniformNodes(document: Document): string[] {
  return document
    .getRoot()
    .listNodes()
    .filter((node) => {
      const [x, y, z] = node.getScale();
      return x !== y || y !== z;
    })
    .map((node) => node.getName());
}

/** The manifest list with this entry added or replaced, sorted by model key. */
export function writeManifestEntry(
  entries: readonly ModelEntry[],
  entry: ModelEntry,
): ModelEntry[] {
  return [...entries.filter((item) => item.modelKey !== entry.modelKey), entry].sort((a, b) =>
    a.modelKey.localeCompare(b.modelKey),
  );
}
