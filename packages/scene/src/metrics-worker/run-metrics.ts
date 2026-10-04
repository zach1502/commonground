import { computeMetrics, type CatalogIndex, type Heightmap } from '@parkshape/core';

import type {
  HeightmapData,
  MetricsRequest,
  MetricsRequestMessage,
  MetricsResult,
} from './protocol.js';

function heightmapOf(data: HeightmapData): Heightmap {
  return {
    width: data.width,
    height: data.height,
    resolutionM: data.resolutionM,
    originLocal: data.originLocal,
    elevations: data.elevations,
  };
}

/** Runs the core metrics for one payload. Pure, so the worker and the main-thread fallback share it. */
export function runMetrics(message: MetricsRequestMessage, catalog: CatalogIndex): MetricsResult {
  return computeMetrics({
    document: message.document,
    parcel: message.parcel,
    parameters: message.parameters,
    catalog,
    heightmap: heightmapOf(message.heightmap),
    baseline: message.baseline,
  });
}

/**
 * Builds the worker payload for a request. The elevations are copied so transferring the copy's
 * buffer never detaches the editor's own heightmap.
 */
export function toRequestMessage(
  requestId: number,
  request: MetricsRequest,
): { readonly message: MetricsRequestMessage; readonly transfer: readonly Transferable[] } {
  const elevations = new Float32Array(request.heightmap.elevations);
  const heightmap: HeightmapData = {
    width: request.heightmap.width,
    height: request.heightmap.height,
    resolutionM: request.heightmap.resolutionM,
    originLocal: request.heightmap.originLocal,
    elevations,
  };
  return {
    message: {
      requestId,
      document: request.document,
      parcel: request.parcel,
      parameters: request.parameters,
      heightmap,
      baseline: request.baseline,
    },
    transfer: [elevations.buffer],
  };
}
