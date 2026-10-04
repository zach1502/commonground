import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { freePort } from './free-port.js';

/** The built Node entry; turbo builds it before the tests run. */
export const BUILT_ENTRY = fileURLToPath(new URL('../../dist/entry.node.js', import.meta.url));
export const ENTRY_IS_BUILT = existsSync(BUILT_ENTRY);

const SECRET = 'recovery-test-secret-of-32-characters';
const LISTENING = /api listening on http:\/\/localhost:(\d+)/;

export interface ExitReport {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly afterMs: number;
}

export interface SpawnedEntry {
  readonly child: ChildProcess;
  readonly port: number;
  stderr(): string;
  /** Resolves with the exit code and how long after `since` the process ended. */
  exited(since: number): Promise<ExitReport>;
}

function waitForListening(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let out = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (text: string) => {
      out += text;
      const match = LISTENING.exec(out);
      if (match?.[1] !== undefined) resolve(Number(match[1]));
    });
    child.once('exit', (code) => {
      reject(new Error(`the entry exited with ${String(code)} before listening`));
    });
  });
}

/** Starts dist/entry.node.js on a free port with in-memory pglite unless env says otherwise. */
export async function spawnEntry(env: Record<string, string> = {}): Promise<SpawnedEntry> {
  const port = await freePort('any');
  const child = spawn(process.execPath, [BUILT_ENTRY], {
    env: {
      DATABASE_URL: 'pglite://memory',
      AUTH_SECRET: SECRET,
      PARKSHAPE_OFFLINE: '1',
      PORT: String(port),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (text: string) => {
    errors += text;
  });
  const exit = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
  return {
    child,
    port: await waitForListening(child),
    stderr: () => errors,
    exited: async (since) => {
      const [code, signal] = await exit;
      return { code, signal, afterMs: performance.now() - since };
    },
  };
}
