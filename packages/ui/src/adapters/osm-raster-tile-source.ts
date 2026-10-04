import type { MapStyle, MapTileSource } from '../ports/map-tile-source.js';

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_TILE_SIZE_PX = 256;
// The OSM tile usage policy serves zoom 0 to 19.
const OSM_MAX_ZOOM = 19;

export interface OsmRasterOptions {
  /** The credit line the OSM licence asks for; comes from the app so copy stays in locales. */
  readonly attribution: string;
}

/** OpenStreetMap raster tiles from the public tile server. */
export class OsmRasterTileSource implements MapTileSource {
  readonly name = 'osm-raster';
  private readonly style: MapStyle;

  constructor(options: OsmRasterOptions) {
    this.style = {
      kind: 'raster',
      tiles: [OSM_TILES],
      tileSizePx: OSM_TILE_SIZE_PX,
      maxZoom: OSM_MAX_ZOOM,
      attribution: options.attribution,
    };
  }

  styleOrTiles(): MapStyle {
    return this.style;
  }
}
