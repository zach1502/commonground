import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { authSecretFile, resolveAuthSecret } from './auth-secret.js';

const SET_SECRET = 's'.repeat(32);
const MIN_LENGTH = 32;
const OWNER_ONLY = 0o600;
const PERMISSION_BITS = 0o777;

function recordingLogger() {
  const warnings: string[] = [];
  return { warnings, logger: { warn: (message: string) => warnings.push(message) } };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'parkshape-secret-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('resolveAuthSecret', () => {
  it('uses AUTH_SECRET when it is set and logs nothing', async () => {
    const { warnings, logger } = recordingLogger();
    const config = { AUTH_SECRET: SET_SECRET, DATABASE_URL: 'postgres://db/app' };
    expect(await resolveAuthSecret(config, logger)).toBe(SET_SECRET);
    expect(warnings).toEqual([]);
  });

  it('keeps a generated secret next to a pglite database so it survives a restart', async () => {
    const { warnings, logger } = recordingLogger();
    const config = { AUTH_SECRET: '', DATABASE_URL: `pglite://${join(dir, 'nested', 'db')}` };
    const first = await resolveAuthSecret(config, logger);
    const second = await resolveAuthSecret(config, logger);
    expect(first.length).toBeGreaterThanOrEqual(MIN_LENGTH);
    expect(second).toBe(first);
    const file = authSecretFile(config.DATABASE_URL) ?? '';
    expect(file).toBe(join(dir, 'nested', 'db.auth-secret'));
    expect((await readFile(file, 'utf8')).trim()).toBe(first);
    expect((await stat(file)).mode & PERMISSION_BITS).toBe(OWNER_ONLY);
    expect(warnings[0]).toMatch(/AUTH_SECRET is empty/);
    expect(warnings[0]).toMatch(/db\.auth-secret/);
  });

  it('replaces a stored secret that is too short', async () => {
    const { logger } = recordingLogger();
    const url = `pglite://${join(dir, 'db')}`;
    await writeFile(authSecretFile(url) ?? '', 'short');
    const secret = await resolveAuthSecret({ AUTH_SECRET: '', DATABASE_URL: url }, logger);
    expect(secret.length).toBeGreaterThanOrEqual(MIN_LENGTH);
  });

  it('uses a random secret for an in-memory pglite database and says so', async () => {
    const { warnings, logger } = recordingLogger();
    const config = { AUTH_SECRET: '', DATABASE_URL: 'pglite://memory' };
    const first = await resolveAuthSecret(config, logger);
    expect(await resolveAuthSecret(config, logger)).not.toBe(first);
    expect(warnings[0]).toMatch(/random secret/);
  });

  it('refuses to start a hosted database without AUTH_SECRET', async () => {
    const { logger } = recordingLogger();
    const config = { AUTH_SECRET: '', DATABASE_URL: 'postgres://db/app' };
    await expect(resolveAuthSecret(config, logger)).rejects.toThrow(/AUTH_SECRET/);
  });
});
