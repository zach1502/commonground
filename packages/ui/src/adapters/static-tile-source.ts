import type { MapStyle, MapTileSource } from '../ports/map-tile-source.js';

export interface StaticTileOptions {
  /** Any CSS colour MapLibre can parse. */
  readonly colour: string;
  readonly attribution: string;
}

/** One flat colour and no network, so tests and offline runs draw the same map every time. */
export class StaticTileSource implements MapTileSource {
  readonly name = 'static';
  private readonly style: MapStyle;

  constructor(options: StaticTileOptions) {
    this.style = { kind: 'solid', colour: options.colour, attribution: options.attribution };
  }

  styleOrTiles(): MapStyle {
    return this.style;
  }
}
