import { parentPort, type MessagePort } from 'node:worker_threads';

import { createWorkerHandler, type WorkerRequest } from './metrics-job.js';

/** Answers the jobs WorkerPoolMetricsRunner sends, one at a time and in order. */
function serveMetricsJobs(port: MessagePort): void {
  const handle = createWorkerHandler();
  port.on('message', (request: WorkerRequest) => {
    port.postMessage(handle(request));
  });
}

if (parentPort === null) {
  throw new Error('metrics-worker runs only as a worker thread');
}
serveMetricsJobs(parentPort);
