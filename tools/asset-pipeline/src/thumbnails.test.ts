import { describe, expect, it } from 'vitest';

import {
  hashOf,
  pngSize,
  thumbnailFile,
  thumbnailManifest,
  thumbnailPlan,
  type ThumbnailManifest,
} from './thumbnails.js';

const ITEMS = [
  { id: 'bench', modelKey: 'bench' },
  { id: 'douglas-fir', modelKey: 'tree-douglas-fir' },
];
const HASHES = new Map([
  ['bench', 'aaa'],
  ['tree-douglas-fir', 'bbb'],
]);
const SETTINGS = 'settings-1';

const existing: ThumbnailManifest = {
  note: 'n',
  settingsHash: SETTINGS,
  thumbnails: [
    {
      itemId: 'bench',
      modelKey: 'bench',
      file: thumbnailFile('bench'),
      modelHash: 'aaa',
      bytes: 10,
    },
    {
      itemId: 'douglas-fir',
      modelKey: 'tree-douglas-fir',
      file: thumbnailFile('douglas-fir'),
      modelHash: 'bbb',
      bytes: 12,
    },
  ],
};

const plan = (overrides: Partial<Parameters<typeof thumbnailPlan>[0]> = {}) =>
  thumbnailPlan({
    items: ITEMS,
    modelHashes: HASHES,
    existing,
    settingsHash: SETTINGS,
    present: () => true,
    ...overrides,
  });

describe('thumbnailPlan', () => {
  it('renders nothing when every model and the settings are unchanged', () => {
    expect(plan().render).toEqual([]);
  });

  it('renders again the item whose model hash changed', () => {
    const changed = new Map([...HASHES, ['tree-douglas-fir', 'ccc']]);
    expect(plan({ modelHashes: changed }).render.map((item) => item.id)).toEqual(['douglas-fir']);
  });

  it('renders every item when the camera or light settings changed', () => {
    expect(plan({ settingsHash: 'settings-2' }).render).toHaveLength(ITEMS.length);
  });

  it('renders an item with no manifest entry or no file on disk', () => {
    expect(plan({ existing: undefined }).render).toHaveLength(ITEMS.length);
    const missing = plan({ present: (file) => !file.includes('bench') });
    expect(missing.render.map((item) => item.id)).toEqual(['bench']);
  });

  it('throws when an item has no processed model', () => {
    expect(() => plan({ modelHashes: new Map([['bench', 'aaa']]) })).toThrow(/douglas-fir/);
  });
});

describe('thumbnailManifest', () => {
  it('keeps catalog order and drops items no longer in the catalog', () => {
    const fresh = {
      itemId: 'gone',
      modelKey: 'gone',
      file: thumbnailFile('gone'),
      modelHash: 'x',
      bytes: 1,
    };
    const manifest = thumbnailManifest(ITEMS, [...existing.thumbnails, fresh], SETTINGS);
    expect(manifest.thumbnails.map((entry) => entry.itemId)).toEqual(['bench', 'douglas-fir']);
    expect(manifest.settingsHash).toBe(SETTINGS);
  });
});

describe('helpers', () => {
  it('names each file after the catalog item id under catalog-thumbs', () => {
    expect(thumbnailFile('picnic-table')).toBe('catalog-thumbs/picnic-table.png');
  });

  it('hashes bytes with sha256', () => {
    expect(hashOf(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('reads the pixel size from a PNG header', () => {
    const header = new Uint8Array(24);
    header.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    header.set([0, 0, 1, 0, 0, 0, 1, 0], 16);
    expect(pngSize(header)).toEqual({ width: 256, height: 256 });
    expect(pngSize(new Uint8Array(4))).toBeNull();
  });
});
