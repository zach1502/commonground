import { Document } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';

import { finishMaterials, hueOfLinear } from './finish.js';

// DESIGN.md: canopies sit within 10 degrees of the terrainGrass hue, 93 degrees.
const GRASS_HUE_DEG = 93;
const HUE_LIMIT_DEG = 10;

function documentWith(...names: string[]): Document {
  const document = new Document();
  names.forEach((name) => {
    document.createMaterial(name).setBaseColorFactor([0.16, 0.79, 0.67, 1]).setMetallicFactor(1);
  });
  return document;
}

describe('finishMaterials', () => {
  it('recolours Kenney canopies to within 10 degrees of the grass hue', () => {
    const document = documentWith('leafsGreen', 'leafsDark', 'leafsFall', 'grass');
    finishMaterials(document, 'tree-bigleaf-maple');
    document
      .getRoot()
      .listMaterials()
      .forEach((material) => {
        const hue = hueOfLinear(material.getBaseColorFactor());
        expect(Math.abs(hue - GRASS_HUE_DEG)).toBeLessThanOrEqual(HUE_LIMIT_DEG);
      });
  });

  it('sets metalness to 0 and roughness to 0.5 or more on every material', () => {
    const document = documentWith('leafsGreen', 'woodBark', 'metal', 'roof');
    finishMaterials(document, 'washroom-building');
    document
      .getRoot()
      .listMaterials()
      .forEach((material) => {
        expect(material.getMetallicFactor()).toBe(0);
        expect(material.getRoughnessFactor()).toBeGreaterThanOrEqual(0.5);
      });
  });

  it('turns the red kit shed to the soil browns', () => {
    const document = documentWith('DarkRed', 'LightRed');
    finishMaterials(document, 'kit-shed');
    document
      .getRoot()
      .listMaterials()
      .forEach((material) => {
        const hue = hueOfLinear(material.getBaseColorFactor());
        expect(hue).toBeGreaterThan(20);
        expect(hue).toBeLessThan(40);
      });
  });

  it('drops the bench colour atlas for a flat wood tint', () => {
    const document = documentWith('colormap');
    const [material] = document.getRoot().listMaterials();
    material?.setBaseColorTexture(document.createTexture('atlas'));
    finishMaterials(document, 'bench');
    expect(material?.getBaseColorTexture()).toBeNull();
  });
});

describe('finishMaterials on the juice round models', () => {
  it.each(['hedge', 'wayfinding-sign', 'compost-bin', 'recycling-bin'])(
    'drops the %s colour atlas for a flat palette tint',
    (modelKey) => {
      const document = documentWith('colormap');
      const [material] = document.getRoot().listMaterials();
      material?.setBaseColorTexture(document.createTexture('atlas'));
      finishMaterials(document, modelKey);
      expect(material?.getBaseColorTexture()).toBeNull();
    },
  );

  it('tints the recycling bin blue so it reads apart from the waste bin', () => {
    const document = documentWith('metal', 'metalDark');
    finishMaterials(document, 'recycling-bin');
    document
      .getRoot()
      .listMaterials()
      .forEach((material) => {
        const hue = hueOfLinear(material.getBaseColorFactor());
        expect(hue).toBeGreaterThan(190);
        expect(hue).toBeLessThan(220);
      });
  });

  it('turns the red gazebo roof to the soil browns', () => {
    const document = documentWith('RoofTiles_Red');
    finishMaterials(document, 'gazebo');
    const [material] = document.getRoot().listMaterials();
    const hue = hueOfLinear(material?.getBaseColorFactor() ?? [0, 0, 0, 1]);
    expect(hue).toBeGreaterThan(20);
    expect(hue).toBeLessThan(40);
  });
});
