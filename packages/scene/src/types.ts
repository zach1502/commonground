/** A point on the ground plane, in metres from the heightmap origin. */
export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A scale request; only equal components are allowed on a mesh. */
export type ScaleRequest = number | Vector3;

export type ItemCategory = 'tree' | 'shrub' | 'building' | 'bench' | 'play' | 'other';

export interface CatalogItem {
  readonly id: string;
  readonly modelKey: string;
  readonly category: ItemCategory;
}

export interface PlacedItem {
  readonly id: string;
  readonly catalogId: string;
  readonly position: GroundPoint;
  readonly rotationY: number;
  readonly scale: ScaleRequest;
}

export type PathSurface = 'asphalt' | 'gravel' | 'boardwalk';

export interface PathFeature {
  readonly id: string;
  readonly points: readonly GroundPoint[];
  readonly widthM: number;
  /** Drawn as gravel when the design does not say. */
  readonly surface?: PathSurface;
}

export type AreaKind = 'garden' | 'playground' | 'dog-park' | 'lawn';

export interface AreaFeature {
  readonly id: string;
  readonly kind: AreaKind;
  readonly outline: readonly GroundPoint[];
}

export interface WaterFeature {
  readonly id: string;
  readonly outline: readonly GroundPoint[];
}

/** The park design a resident submits. */
export interface ParkDocument {
  readonly items: readonly PlacedItem[];
  readonly paths: readonly PathFeature[];
  readonly areas: readonly AreaFeature[];
  readonly water: readonly WaterFeature[];
}

/** Model files keyed by modelKey, written by the asset pipeline. */
export type AssetManifest = Readonly<Record<string, { readonly url: string }>>;

/** Flat triangle mesh arrays ready for a BufferGeometry. */
export interface MeshArrays {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
}
