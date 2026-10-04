import type { Heightmap, Result } from '@parkshape/core';

import type { GeoJsonPolygon } from '../geojson.js';

import type { HttpError } from './http.js';

export interface TerrainRequest {
  /** The area to cover, in WGS84. The heightmap covers its bounding box in the local frame. */
  readonly polygonWgs84: GeoJsonPolygon;
  /** Side length of one output cell, in metres. */
  readonly resolutionM: number;
}

/** Where elevations came from, for the attribution line and the handoff to planners. */
export interface TerrainSource {
  readonly name: string;
  readonly licence: string;
  readonly url: string;
}

/** One provider tried by a chain, in the order tried. */
export interface ProviderAttempt {
  readonly provider: string;
  readonly outcome: 'succeeded' | 'failed';
  readonly errorKind?: string;
}

export interface TerrainResult {
  /** Grid in the local frame of the request polygon, origin at the bounding box minimum. */
  readonly heightmap: Heightmap;
  readonly source: TerrainSource;
  /** CRS of the data the elevations were read from, such as `EPSG:3979`. */
  readonly crs: string;
  readonly attempts?: readonly ProviderAttempt[];
}

export type TerrainError =
  | HttpError
  | { readonly kind: 'invalidRequest'; readonly reason: string }
  | { readonly kind: 'noCoverage'; readonly collection: string }
  | { readonly kind: 'noDtmAsset'; readonly itemId: string }
  | { readonly kind: 'unsupportedCrs'; readonly crs: string }
  | { readonly kind: 'crsMismatch'; readonly stacEpsg: number; readonly cogEpsg: number }
  | { readonly kind: 'noData'; readonly cells: number }
  | { readonly kind: 'outsideCoverage'; readonly source: string }
  | { readonly kind: 'allProvidersFailed'; readonly attempts: readonly ProviderAttempt[] };

/** Supplies ground elevations (bare earth, never surface models) for an area. */
export interface TerrainProvider {
  readonly name: string;
  getHeightmap(request: TerrainRequest): Promise<Result<TerrainResult, TerrainError>>;
}
