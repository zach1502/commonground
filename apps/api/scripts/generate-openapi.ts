import { writeFileSync } from 'node:fs';

import { renderOpenApi } from '../src/openapi.js';

const SPEC_FILE = new URL('../openapi.json', import.meta.url);

writeFileSync(SPEC_FILE, renderOpenApi());
process.stdout.write(`wrote ${SPEC_FILE.pathname}\n`);
