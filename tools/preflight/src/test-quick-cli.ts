#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawnExec } from './exec.js';
import { runTestQuick } from './test-quick.js';

// Both src/ (through tsx) and dist/ sit two levels below tools/preflight's parent.
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function runInTerminal(command: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], { cwd: ROOT_DIR, stdio: 'inherit' });
    child.on('error', () => {
      resolve(1);
    });
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}

process.exitCode = await runTestQuick({
  rootDir: ROOT_DIR,
  exec: spawnExec,
  run: runInTerminal,
  write: (line) => {
    process.stdout.write(`${line}\n`);
  },
});
