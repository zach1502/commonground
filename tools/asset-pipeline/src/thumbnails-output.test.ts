import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { catalogItems } from '@parkshape/core';

import { modelsManifestSchema } from './manifest-schema.js';
import { hashOf, pngSize, thumbnailFile, thumbnailManifestSchema } from './thumbnails.js';

// These tests read the committed output of `thumbnails`, so a missing or stale picture fails here.
const SIDE_PX = 256;
const publicDir = new URL('../../../apps/web/public/', import.meta.url);
const publicPath = (file: string) => fileURLToPath(new URL(file, publicDir));
const readJson = (relative: string): unknown =>
  JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));

const manifestPath = new URL('../generated/thumbnails.manifest.json', import.meta.url);
const manifest = thumbnailManifestSchema.parse(
  existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {},
);
const models = modelsManifestSchema.parse(readJson('../generated/models.manifest.json'));
const entryFor = (itemId: string) => manifest.thumbnails.find((entry) => entry.itemId === itemId);

describe('catalog thumbnails', () => {
  it('lists exactly one picture per catalog item, in catalog order', () => {
    expect(manifest.thumbnails.map((entry) => entry.itemId)).toEqual(
      catalogItems.map((item) => item.id),
    );
  });

  it.each(catalogItems)('$id has a 256 px square PNG in catalog-thumbs', (item) => {
    const entry = entryFor(item.id);
    expect(entry?.file).toBe(thumbnailFile(item.id));
    const bytes = readFileSync(publicPath(thumbnailFile(item.id)));
    expect(pngSize(bytes)).toEqual({ width: SIDE_PX, height: SIDE_PX });
    expect(entry?.bytes).toBe(bytes.length);
  });

  it.each(catalogItems)('$id was drawn from the current processed model', (item) => {
    const model = models.models.find((entry) => entry.modelKey === item.modelKey);
    if (model === undefined) throw new Error(`no model for ${item.modelKey}`);
    expect(entryFor(item.id)).toMatchObject({
      modelKey: item.modelKey,
      modelHash: hashOf(readFileSync(publicPath(model.file))),
    });
  });
});
