/// <reference lib="webworker" />
import { catalogIndex } from '@parkshape/core';

import type { MetricsRequestMessage, MetricsResponseMessage } from './protocol.js';
import { runMetrics } from './run-metrics.js';

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<MetricsRequestMessage>) => {
  const message = event.data;
  const response: MetricsResponseMessage = {
    requestId: message.requestId,
    result: runMetrics(message, catalogIndex),
  };
  worker.postMessage(response);
};
