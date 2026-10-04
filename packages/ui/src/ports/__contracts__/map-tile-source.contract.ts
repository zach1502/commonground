import { describe, expect, it } from 'vitest';

import type { MapTileSource } from '../map-tile-source.js';

const TILE_TEMPLATE = /\{z\}.*\{x\}.*\{y\}/;

/** Every MapTileSource adapter runs this: a usable basemap description with attribution. */
export function mapTileSourceContract(name: string, create: () => MapTileSource): void {
  describe(`MapTileSource contract: ${name}`, () => {
    it('describes a raster or solid basemap', () => {
      const style = create().styleOrTiles();
      if (style.kind === 'raster') {
        expect(style.tiles.length).toBeGreaterThan(0);
        style.tiles.forEach((tile) => {
          expect(tile).toMatch(TILE_TEMPLATE);
          expect(tile.startsWith('https://')).toBe(true);
        });
        expect(style.tileSizePx).toBeGreaterThan(0);
        expect(style.maxZoom).toBeGreaterThan(0);
      } else {
        expect(style.colour).not.toBe('');
      }
    });

    it('credits its source', () => {
      expect(create().styleOrTiles().attribution).not.toBe('');
    });

    it('returns the same description on every call', () => {
      const source = create();
      expect(source.styleOrTiles()).toEqual(source.styleOrTiles());
    });

    it('has a name for logs and tests', () => {
      expect(create().name).not.toBe('');
    });
  });
}
