import { describe, expect, it } from 'vitest';

import { mapTileSourceContract } from '../ports/__contracts__/map-tile-source.contract.js';

import { OsmRasterTileSource } from './osm-raster-tile-source.js';
import { StaticTileSource } from './static-tile-source.js';

const ATTRIBUTION = 'OpenStreetMap contributors';

mapTileSourceContract(
  'OsmRasterTileSource',
  () => new OsmRasterTileSource({ attribution: ATTRIBUTION }),
);
mapTileSourceContract(
  'StaticTileSource',
  () => new StaticTileSource({ colour: 'rgb(107, 143, 78)', attribution: 'Test fill' }),
);

describe('OsmRasterTileSource', () => {
  it('points at the OpenStreetMap tile server', () => {
    const style = new OsmRasterTileSource({ attribution: ATTRIBUTION }).styleOrTiles();
    expect(style).toMatchObject({ kind: 'raster', attribution: ATTRIBUTION });
    expect(style.kind === 'raster' ? style.tiles[0] : '').toContain('tile.openstreetmap.org');
  });
});

describe('StaticTileSource', () => {
  it('fills the map with one colour and needs no network', () => {
    const style = new StaticTileSource({
      colour: 'green',
      attribution: 'Test fill',
    }).styleOrTiles();
    expect(style).toEqual({ kind: 'solid', colour: 'green', attribution: 'Test fill' });
  });
});
