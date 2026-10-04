import { SystemClock } from '@parkshape/core';

import { fetchContext } from './fetch-context-command.js';

// process.argv starts with the node binary and the script path.
const FIRST_ARGUMENT = 2;

process.exitCode = await fetchContext(process.argv.slice(FIRST_ARGUMENT), {
  fetch: globalThis.fetch,
  log: console.log,
  clock: new SystemClock(),
});
