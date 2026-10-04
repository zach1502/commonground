import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

/** Built code runs the worker file as it is; source goes through tsx's loader first. */
export type WorkerScript =
  | { readonly kind: 'built'; readonly url: URL }
  | { readonly kind: 'source'; readonly url: URL; readonly tsxApi: string };

/**
 * The worker file beside this module: `metrics-worker.js` in dist, or `metrics-worker.ts` when
 * vitest or tsx runs the source, which then reads workspace packages from src too.
 */
export function metricsWorkerScript(moduleUrl: string = import.meta.url): WorkerScript {
  if (!moduleUrl.endsWith('.ts')) {
    return { kind: 'built', url: new URL('./metrics-worker.js', moduleUrl) };
  }
  const tsxPackage = pathToFileURL(createRequire(moduleUrl).resolve('tsx/package.json'));
  return {
    kind: 'source',
    url: new URL('./metrics-worker.ts', moduleUrl),
    tsxApi: new URL('./dist/esm/api/index.mjs', tsxPackage).href,
  };
}

/** Starts one metrics worker thread from the script. */
export function startWorker(script: WorkerScript): Worker {
  if (script.kind === 'built') return new Worker(script.url);
  const tsxApi = JSON.stringify(script.tsxApi);
  const entry = JSON.stringify(script.url.href);
  const bootstrap = `import(${tsxApi}).then((tsx) => { tsx.register(); return import(${entry}); });`;
  return new Worker(bootstrap, { eval: true, execArgv: ['--conditions=@parkshape/source'] });
}
