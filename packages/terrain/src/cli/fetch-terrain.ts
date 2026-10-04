import { fetchTerrain } from './fetch-terrain-command.js';

// process.argv starts with the node binary and the script path.
const FIRST_ARGUMENT = 2;

process.exitCode = await fetchTerrain(process.argv.slice(FIRST_ARGUMENT), {
  fetch: globalThis.fetch,
  log: console.log,
});
