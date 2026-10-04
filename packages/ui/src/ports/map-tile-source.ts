/** A basemap made of raster tiles, such as OpenStreetMap. */
export interface RasterMapStyle {
  readonly kind: 'raster';
  /** URL templates with {z}, {x} and {y}. */
  readonly tiles: readonly string[];
  readonly tileSizePx: number;
  readonly maxZoom: number;
  readonly attribution: string;
}

/** A basemap of one flat colour, for tests and offline runs. */
export interface SolidMapStyle {
  readonly kind: 'solid';
  readonly colour: string;
  readonly attribution: string;
}

export type MapStyle = RasterMapStyle | SolidMapStyle;

/** Where the planner map gets its basemap. Adapters live in src/adapters. */
export interface MapTileSource {
  readonly name: string;
  styleOrTiles(): MapStyle;
}
