import type {
  CatalogIndex,
  DesignDocument,
  Heightmap,
  InvalidDocument,
  MetricsReport,
  Parcel,
  PlanePoint,
  ProjectParameters,
  Result,
} from '@parkshape/core';

/** A heightmap whose elevations travel as a transferable Float32Array. */
export interface HeightmapData {
  readonly width: number;
  readonly height: number;
  readonly resolutionM: number;
  readonly originLocal: PlanePoint;
  readonly elevations: Float32Array;
}

/**
 * One metrics job as the caller states it. The catalog is the core singleton, so it never
 * crosses the worker boundary; the worker imports it directly.
 */
export interface MetricsRequest {
  readonly document: DesignDocument;
  readonly parcel: Parcel;
  readonly parameters: ProjectParameters;
  readonly catalog: CatalogIndex;
  readonly heightmap: Heightmap;
  /** The park as it is today; an unchanged baseline garden counts its recorded plots. */
  readonly baseline?: DesignDocument | undefined;
}

/** The payload posted to the worker. Its elevations are a copy that the sender transfers. */
export interface MetricsRequestMessage {
  readonly requestId: number;
  readonly document: DesignDocument;
  readonly parcel: Parcel;
  readonly parameters: ProjectParameters;
  readonly heightmap: HeightmapData;
  readonly baseline?: DesignDocument | undefined;
}

export type MetricsResult = Result<MetricsReport, InvalidDocument>;

export interface MetricsResponseMessage {
  readonly requestId: number;
  readonly result: MetricsResult;
}

/** The slice of the Web Worker API the client uses; the real Worker satisfies it. */
export interface WorkerLike {
  postMessage: (message: MetricsRequestMessage, transfer: readonly Transferable[]) => void;
  onmessage: ((event: { readonly data: MetricsResponseMessage }) => void) | null;
  terminate: () => void;
}
