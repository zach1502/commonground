import type { Result, SiteContext } from '@parkshape/core';

import type { GeoJsonPolygon } from '../geojson.js';

import type { HttpError } from './http.js';

export interface SiteContextRequest {
  /** The parcel. Context coordinates use its local frame, with the box minimum at (0, 0). */
  readonly polygonWgs84: GeoJsonPolygon;
  /** How far past the parcel box to reach, in metres, such as CONTEXT_BUFFER_M. */
  readonly bufferM: number;
}

export type SiteContextError =
  HttpError | { readonly kind: 'invalidRequest'; readonly reason: string };

/**
 * Supplies the streets, sidewalks, bus stops, parking and bikeways around a parcel. It returns
 * core types only, never source rows, sorted by kind and then id.
 */
export interface SiteContextProvider {
  readonly name: string;
  getContext(request: SiteContextRequest): Promise<Result<SiteContext, SiteContextError>>;
}
