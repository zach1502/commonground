import { Document, type Material } from '@gltf-transform/core';

import { shapeArrays } from './geometry.js';
import { COLOURS, part, surfacePad, type Part, type PartColour } from './parts.js';
import { MODEL_COMPOSITES } from './play-composites.js';
import type { AssetTarget, Dims } from './targets.js';

export type { Part, PartColour } from './parts.js';

// Proportions of the catalog box that each composite spends on its parts.
const TREE = { trunkHeight: 0.5, trunkWidth: 0.05, crownBase: 0.4, crownWidth: 0.4 };
const HALF = 0.5;
const SPORTS = { slabM: 0.05, postM: 0.12, panelM: 0.05 };
const PLAY = { postM: 0.12, beamM: 0.15, deck: 0.4 };
const AMENITY = { pedestalWidth: 0.4, pedestalHeight: 0.7 };
const BUILDING = { wallHeight: 0.75 };
const PICNIC = {
  topDepth: 0.45,
  topM: 0.06,
  seatDepth: 0.2,
  seatHeight: 0.55,
  frameInset: 0.15,
  frameM: 0.08,
};

function treeParts({ heightM }: Dims): Part[] {
  const crownM = heightM * TREE.crownWidth;
  const crownBase = heightM * TREE.crownBase;
  return [
    part({
      shape: 'cylinder',
      widthM: heightM * TREE.trunkWidth,
      depthM: heightM * TREE.trunkWidth,
      heightM: heightM * TREE.trunkHeight,
      colour: 'bark',
    }),
    part({
      shape: 'sphere',
      widthM: crownM,
      depthM: crownM,
      heightM: heightM - crownBase,
      baseY: crownBase,
      colour: 'leaf',
    }),
  ];
}

function postPair(dims: Dims, postM: number, colour: PartColour): Part[] {
  const offset = (dims.widthM - postM) * HALF;
  return [-offset, offset].map((x) =>
    part({ shape: 'cylinder', widthM: postM, depthM: postM, heightM: dims.heightM, x, colour }),
  );
}

function sportsParts(dims: Dims): Part[] {
  const { widthM, depthM, heightM } = dims;
  return [
    part({
      shape: 'box',
      widthM,
      depthM,
      heightM: Math.min(SPORTS.slabM, heightM),
      colour: 'court',
    }),
    ...postPair(dims, SPORTS.postM, 'metal'),
    part({
      shape: 'box',
      widthM,
      depthM: SPORTS.panelM,
      heightM: heightM * HALF,
      baseY: heightM * HALF,
      colour: 'metal',
    }),
  ];
}

function playParts(dims: Dims): Part[] {
  const { widthM, depthM, heightM } = dims;
  const beamM = Math.min(PLAY.beamM, heightM * HALF);
  return [
    surfacePad(dims, 'mulch'),
    ...postPair(dims, PLAY.postM, 'play'),
    part({
      shape: 'box',
      widthM,
      depthM: beamM,
      heightM: beamM,
      baseY: heightM - beamM,
      colour: 'play',
    }),
    part({
      shape: 'box',
      widthM: widthM * PLAY.deck,
      depthM: depthM * PLAY.deck,
      heightM: heightM * PLAY.deck,
      colour: 'wood',
    }),
  ];
}

function amenityParts({ widthM, depthM, heightM }: Dims): Part[] {
  const pedestalM = heightM * AMENITY.pedestalHeight;
  const stemM = Math.min(widthM, depthM) * AMENITY.pedestalWidth;
  return [
    part({ shape: 'cylinder', widthM: stemM, depthM: stemM, heightM: pedestalM, colour: 'metal' }),
    part({
      shape: 'box',
      widthM,
      depthM,
      heightM: heightM - pedestalM,
      baseY: pedestalM,
      colour: 'concrete',
    }),
  ];
}

function picnicParts({ widthM, depthM, heightM }: Dims): Part[] {
  const seatZ = (depthM - depthM * PICNIC.seatDepth) * HALF;
  const frameX = (widthM - widthM * PICNIC.frameInset) * HALF;
  const seat = {
    shape: 'box',
    widthM,
    depthM: depthM * PICNIC.seatDepth,
    heightM: PICNIC.topM,
    colour: 'wood',
  } as const;
  return [
    part({
      shape: 'box',
      widthM,
      depthM: depthM * PICNIC.topDepth,
      heightM: PICNIC.topM,
      baseY: heightM - PICNIC.topM,
      colour: 'wood',
    }),
    part({ ...seat, baseY: heightM * PICNIC.seatHeight, z: -seatZ }),
    part({ ...seat, baseY: heightM * PICNIC.seatHeight, z: seatZ }),
    ...[-frameX, frameX].map((x) =>
      part({
        shape: 'box',
        widthM: PICNIC.frameM,
        depthM,
        heightM: heightM - PICNIC.topM,
        x,
        colour: 'metal',
      }),
    ),
  ];
}

function buildingParts({ widthM, depthM, heightM }: Dims): Part[] {
  const wallM = heightM * BUILDING.wallHeight;
  return [
    part({ shape: 'box', widthM, depthM, heightM: wallM, colour: 'concrete' }),
    part({ shape: 'box', widthM, depthM, heightM: heightM - wallM, baseY: wallM, colour: 'roof' }),
  ];
}

const COMPOSITES: Readonly<Record<string, (dims: Dims) => Part[]>> = {
  tree: treeParts,
  shrub: ({ widthM, depthM, heightM }) => [
    part({ shape: 'sphere', widthM, depthM, heightM, colour: 'leaf' }),
  ],
  sports: sportsParts,
  play: playParts,
  amenity: amenityParts,
  lighting: amenityParts,
  seating: picnicParts,
  washroom: buildingParts,
  'kit-building': buildingParts,
};

/** Box, cylinder and sphere composite for a category, sized to the catalog box. */
export function placeholderParts(target: AssetTarget): readonly Part[] {
  const composite = MODEL_COMPOSITES[target.modelKey] ?? COMPOSITES[target.category];
  const { widthM, depthM, heightM } = target.dims;
  return composite === undefined
    ? [part({ shape: 'box', widthM, depthM, heightM, colour: 'soil' })]
    : composite(target.dims);
}

/** A glTF document with one node and mesh per part and one material per colour. */
export function documentFromParts(name: string, parts: readonly Part[]): Document {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene(name);
  document.getRoot().setDefaultScene(scene);
  const materials = new Map<PartColour, Material>();
  parts.forEach((entry, index) => {
    const { r, g, b } = COLOURS[entry.colour];
    const material =
      materials.get(entry.colour) ??
      document.createMaterial(entry.colour).setBaseColorFactor([r, g, b, 1]).setRoughnessFactor(1);
    materials.set(entry.colour, material);
    const arrays = shapeArrays(entry);
    const primitive = document
      .createPrimitive()
      .setMaterial(material)
      .setAttribute(
        'POSITION',
        document.createAccessor().setType('VEC3').setArray(arrays.positions).setBuffer(buffer),
      )
      .setAttribute(
        'NORMAL',
        document.createAccessor().setType('VEC3').setArray(arrays.normals).setBuffer(buffer),
      )
      .setIndices(
        document.createAccessor().setType('SCALAR').setArray(arrays.indices).setBuffer(buffer),
      );
    const mesh = document.createMesh(`${name}-${String(index)}`).addPrimitive(primitive);
    scene.addChild(
      document.createNode().setMesh(mesh).setTranslation([entry.x, entry.baseY, entry.z]),
    );
  });
  return document;
}

/** The stand-in model used when no CC0 source is listed or the download fails. */
export function placeholderDocument(target: AssetTarget): Document {
  return documentFromParts(target.modelKey, placeholderParts(target));
}
