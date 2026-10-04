import { describe, expect, it } from 'vitest';

import { catalogIndex, designDocumentSchema, makeFlatHeightmap, parcelGrid } from '@parkshape/core';

import seed from '../../dev/fixtures/seed-design.generated.json';
import { toParkDocument } from '../editor/document-adapter.js';
import { viewerCatalog } from '../thumbnail/viewer-input.js';

import { groupInstances } from './instances.js';
import { blobShadows, casterGroups, shadowRole } from './shadow-casters.js';

const heightmap = makeFlatHeightmap(parcelGrid(seed.parcel as never));
const document = toParkDocument(designDocumentSchema.parse(seed.document), catalogIndex);
const groups = groupInstances({
  heightmap,
  items: document.items,
  catalog: viewerCatalog,
  random: { next: () => 0.5 },
});

describe('shadowRole', () => {
  it('casts from standing items and only receives on flat ones', () => {
    expect(shadowRole('tree')).toBe('cast');
    expect(shadowRole('building')).toBe('cast');
    expect(shadowRole('bench')).toBe('cast');
    expect(shadowRole('other')).toBe('cast');
    expect(shadowRole('surface')).toBe('receive');
  });
});

describe('casterGroups on the seeded design', () => {
  it('keeps the caster count well under the 40 mesh budget', () => {
    // Each Kenney model has at most 3 meshes after the pipeline joins by material.
    const meshesPerModel = 3;
    expect(casterGroups(groups).length * meshesPerModel).toBeLessThan(40);
  });
});

describe('blobShadows', () => {
  it('puts one blob under every tree and nothing else', () => {
    const treeIds = new Set(
      viewerCatalog.filter((entry) => entry.category === 'tree').map((entry) => entry.id),
    );
    const trees = document.items.filter((item) => treeIds.has(item.catalogId)).length;
    const blobs = blobShadows(groups);
    expect(blobs).toHaveLength(trees);
    blobs.forEach((blob) => {
      expect(blob.scale).toBeGreaterThan(0);
    });
  });
});
