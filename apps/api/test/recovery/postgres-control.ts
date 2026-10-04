import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { loadConfigFromProcess } from '@parkshape/config';

import { freePort } from './free-port.js';

const run = promisify(execFile);
const COMMAND_TIMEOUT_MS = 60_000;
const USER = 'parkshape';

/**
 * A Postgres cluster of this test's own, in a temp directory on a free port, so stopping it
 * never touches the server other test files share through PARKSHAPE_TEST_DATABASE_URL.
 */
export interface PrivatePostgres {
  readonly url: string;
  stop(): Promise<void>;
  start(): Promise<void>;
  /** Stops the server and deletes its directory. */
  remove(): Promise<void>;
}

async function available(file: string): Promise<boolean> {
  try {
    await run(file, ['--version'], { timeout: COMMAND_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs only when PARKSHAPE_TEST_DATABASE_URL is set, which says real Postgres tests are wanted,
 * and initdb and pg_ctl are on PATH. A CI service container has neither binary, so it skips.
 */
export async function privatePostgres(): Promise<PrivatePostgres | undefined> {
  if (loadConfigFromProcess().PARKSHAPE_TEST_DATABASE_URL === '') return undefined;
  if (!(await available('initdb')) || !(await available('pg_ctl'))) return undefined;
  const dir = await mkdtemp(join(tmpdir(), 'parkshape-outage-'));
  const data = join(dir, 'data');
  const port = await freePort();
  await run('initdb', ['-D', data, '-A', 'trust', '-U', USER], { timeout: COMMAND_TIMEOUT_MS });
  const serverOptions = `-p ${String(port)} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`;
  const pgCtl = (args: readonly string[]) =>
    run('pg_ctl', ['-D', data, ...args], { timeout: COMMAND_TIMEOUT_MS });
  const start = async () => {
    await pgCtl(['-o', serverOptions, '-l', join(dir, 'server.log'), '-w', 'start']);
  };
  const stop = async () => {
    await pgCtl(['stop', '-m', 'fast']);
  };
  await start();
  return {
    url: `postgres://${USER}@127.0.0.1:${String(port)}/postgres`,
    stop,
    start,
    remove: async () => {
      await stop().catch(() => undefined);
      await rm(dir, { recursive: true, force: true });
    },
  };
}
