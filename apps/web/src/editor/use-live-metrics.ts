import { useEffect, useState } from 'react';

import {
  catalogIndex,
  type DesignDocument,
  type MetricsReport,
  type Parcel,
  type ProjectParameters,
} from '@parkshape/core';
import type { EditorContext, MetricsClient, MetricsRequest } from '@parkshape/scene/editor';

const CHANGE_MARK = 'parkshape-metrics-change';
const UPDATE_MARK = 'parkshape-metrics-update';
const MEASURE = 'parkshape-metrics';

export interface LiveMetricsInput {
  readonly ctx: EditorContext | null;
  readonly parcel: Parcel;
  readonly parameters: ProjectParameters | null;
  readonly client: MetricsClient;
  /** The park today, so an unchanged baseline garden counts its recorded plots. */
  readonly baseline?: DesignDocument | undefined;
}

function requestOf(
  input: LiveMetricsInput,
  ctx: EditorContext,
  parameters: ProjectParameters,
  document: DesignDocument,
): MetricsRequest {
  return {
    document,
    parcel: input.parcel,
    parameters,
    catalog: catalogIndex,
    heightmap: ctx.baseHeightmap,
    baseline: input.baseline,
  };
}

function markChange(): void {
  if (typeof performance === 'undefined') return;
  performance.clearMarks(CHANGE_MARK);
  performance.mark(CHANGE_MARK);
}

function markUpdate(): void {
  if (typeof performance === 'undefined') return;
  performance.mark(UPDATE_MARK);
  try {
    performance.measure(MEASURE, CHANGE_MARK, UPDATE_MARK);
  } catch {
    // The first report has no preceding change mark; there is nothing to measure yet.
  }
}

/** Recomputes the report whenever the document changes, debounced through the metrics client. */
export function useLiveMetrics(input: LiveMetricsInput): MetricsReport | null {
  const { ctx, client, parameters } = input;
  const [report, setReport] = useState<MetricsReport | null>(null);
  useEffect(() => {
    if (ctx === null || parameters === null) return undefined;
    const unsubscribe = client.subscribe((result) => {
      markUpdate();
      if (result.ok) setReport(result.value);
    });
    markChange();
    client.compute(requestOf(input, ctx, parameters, ctx.store.getState().document));
    const stop = ctx.store.subscribe((state, previous) => {
      if (state.document === previous.document) return;
      markChange();
      client.compute(requestOf(input, ctx, parameters, state.document));
    });
    return () => {
      unsubscribe();
      stop();
    };
    // The request pieces are stable for one open design; the store carries later documents.
  }, [ctx, client, parameters, input.parcel, input.baseline]);
  return report;
}
