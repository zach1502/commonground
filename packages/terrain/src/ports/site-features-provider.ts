import type { CatalogId, LocalPoint, Parcel, Polygon, Result } from '@parkshape/core';

import type { GeoJsonPolygon } from '../geojson.js';

import type { HttpError } from './http.js';

export interface SiteFeaturesRequest {
  /** Park name as the source spells it, such as `Jonathan Rogers Park`. */
  readonly parkName?: string;
  /** Used as the parcel when no park name is given, and to limit the search area. */
  readonly polygonWgs84?: GeoJsonPolygon;
}

export interface SiteParcel {
  readonly polygonWgs84: GeoJsonPolygon;
  /** The same boundary in local metres, with the bounding box minimum at (0, 0). */
  readonly polygonLocal: Polygon;
  /** WGS84 position of the local (0, 0). */
  readonly origin: Parcel['origin'];
}

export type FeatureKind = 'tree' | 'garden' | 'building' | 'sportsField' | 'other';

export interface FeatureAttributes {
  readonly name?: string | undefined;
  readonly species?: string | undefined;
  readonly dbhCm?: number | undefined;
  /** Lowest and highest likely height, from the source's height class. */
  readonly heightRangeM?: readonly [number, number] | undefined;
  /** Crown radius now, estimated from trunk diameter and capped at the mature size. */
  readonly crownRadiusM?: number | undefined;
  readonly crownRadiusMatureM?: number | undefined;
  readonly plots?: number | undefined;
  /** Set when the source has no location and the feature sits at the parcel centre. */
  readonly approximatePosition?: boolean | undefined;
}

export interface FeatureProvenance {
  /** Source name as listed in src/adapters/sources.json. */
  readonly source: string;
  readonly datasetId: string;
  readonly recordId?: string | undefined;
  readonly licence?: string | undefined;
  /** Set for data a planner must check before the app shows it as fact, such as OSM. */
  readonly reviewOnly?: boolean | undefined;
}

interface FeatureBase {
  readonly kind: FeatureKind;
  readonly catalogId?: CatalogId | undefined;
  readonly attributes: FeatureAttributes;
  /** True when the feature should start locked in the editor, such as a large existing tree. */
  readonly suggestedLocked: boolean;
  readonly provenance: FeatureProvenance;
}

/** An existing thing on the site that a design may keep, in local metres. */
export type ProposedFeature =
  (FeatureBase & { readonly position: LocalPoint }) | (FeatureBase & { readonly polygon: Polygon });

export interface SiteFeatures {
  readonly parcel: SiteParcel;
  readonly features: readonly ProposedFeature[];
}

export type SiteFeaturesError =
  | HttpError
  | { readonly kind: 'invalidRequest'; readonly reason: string }
  | { readonly kind: 'parkNotFound'; readonly parkName: string };

/** Supplies the parcel boundary and the existing features on it. */
export interface SiteFeaturesProvider {
  readonly name: string;
  getFeatures(request: SiteFeaturesRequest): Promise<Result<SiteFeatures, SiteFeaturesError>>;
}
