import { loadConfigFromProcess } from '@parkshape/config';

import { runMigrateCommand } from './migrate-command.js';

// process.argv starts with the node binary and this script's path.
const FIRST_ARG = 2;

const MESSAGE = await runMigrateCommand(process.argv.slice(FIRST_ARG), loadConfigFromProcess());
process.stdout.write(`${MESSAGE}\n`);
