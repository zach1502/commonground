#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawnExec } from './exec.js';
import { main } from './main.js';

// Both src/cli.ts (through tsx) and dist/cli.js sit two levels below tools/preflight's parent.
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// argv[0] is node and argv[1] is this script.
const FIRST_ARG_INDEX = 2;

process.exitCode = await main(process.argv.slice(FIRST_ARG_INDEX), {
  rootDir: ROOT_DIR,
  env: process.env,
  exec: spawnExec,
  ppid: process.ppid,
  write: (line) => {
    process.stdout.write(`${line}\n`);
  },
  nodeVersion: process.version,
  nowMs: Date.now(),
});
