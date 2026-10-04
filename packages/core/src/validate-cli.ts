// This entry is the only core file that touches node:fs and process.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { catalogIndex } from './catalog/catalog.js';
import { runValidate } from './validate-command.js';

// argv[0] is node and argv[1] is this script.
const FIRST_ARGUMENT_INDEX = 2;

process.exitCode = runValidate({
  args: process.argv.slice(FIRST_ARGUMENT_INDEX),
  readText: (path) => readFileSync(path, 'utf8'),
  readOptionalText: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined),
  siblingPath: (path, name) => join(dirname(path), name),
  print: (line) => {
    console.log(line);
  },
  catalog: catalogIndex,
});
