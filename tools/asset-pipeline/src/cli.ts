import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

import { parseArgs, runPipeline } from './run.js';
import { httpFetcher, loadSourceDocument } from './sources.js';

// argv holds the node binary and the script path before the flags.
const FIRST_FLAG_INDEX = 2;
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const REPO_DIR = fileURLToPath(new URL('../../..', import.meta.url));

async function readyEncoder(): Promise<unknown> {
  try {
    await MeshoptEncoder.ready;
    return MeshoptEncoder;
  } catch {
    process.stderr.write('meshopt encoder unavailable; writing quantized models only\n');
    return undefined;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(FIRST_FLAG_INDEX));
  await Promise.all([MeshoptSimplifier.ready, MeshoptDecoder.ready]);
  const encoder = await readyEncoder();
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const cache = { cacheDir: `${PACKAGE_DIR}sources`, fetcher: httpFetcher, io };
  const results = await runPipeline(
    {
      sourceManifest: `${PACKAGE_DIR}manifest.json`,
      modelsManifest: `${PACKAGE_DIR}generated/models.manifest.json`,
      outputDir: `${REPO_DIR}apps/web/public/models`,
    },
    options,
    {
      io,
      simplifier: MeshoptSimplifier,
      encoder,
      loadSource: (model) => loadSourceDocument(model, cache),
    },
  );
  results.forEach(({ entry, placeholder, reason }) => {
    const { before, after } = entry.triangles;
    const note = placeholder ? ` placeholder${reason === undefined ? '' : ` (${reason})`}` : '';
    process.stdout.write(
      `${entry.modelKey}\t${String(before)} -> ${String(after)}\t${String(entry.bytes)} B${note}\n`,
    );
  });
}

await main();
