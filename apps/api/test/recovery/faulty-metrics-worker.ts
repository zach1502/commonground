import { parentPort } from 'node:worker_threads';

import { createWorkerHandler, type WorkerRequest } from '../../src/adapters/metrics-job.js';

/**
 * A stand-in for metrics-worker.ts that fails on request. A job whose heightmapKey names a
 * fault gets it: 'fault:throw' throws out of the message handler, 'fault:exit' ends the thread
 * with code 1, and 'fault:hang' never answers. Any other job is measured as usual.
 */
const port = parentPort;
if (port === null) throw new Error('faulty-metrics-worker runs only as a worker thread');
const handle = createWorkerHandler();
const EXIT_FAILURE = 1;

function hang(): never {
  for (;;) {
    // Spins until the pool terminates the thread.
  }
}

port.on('message', (request: WorkerRequest) => {
  switch (request.job.heightmapKey) {
    case 'fault:throw':
      throw new Error('the metrics worker was told to throw');
    case 'fault:exit':
      process.exit(EXIT_FAILURE);
      break;
    case 'fault:hang':
      hang();
      break;
    default:
      port.postMessage(handle(request));
  }
});
