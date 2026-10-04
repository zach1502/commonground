import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Logger } from '@parkshape/ai';
import type { AppConfig } from '@parkshape/config';

const PGLITE_PREFIX = 'pglite://';
const IN_MEMORY_PGLITE = 'memory';
const SECRET_FILE_SUFFIX = '.auth-secret';
const SECRET_BYTES = 32;
// Matches AUTH_SECRET's minimum in packages/config.
const MIN_SECRET_LENGTH = 32;
// Only the owner may read the file, since anyone with it can forge a staff session.
const OWNER_ONLY = 0o600;

type SecretConfig = Pick<AppConfig, 'AUTH_SECRET' | 'DATABASE_URL'>;

function randomSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url');
}

/** Where a local pglite database keeps its generated session secret; undefined when in memory. */
export function authSecretFile(databaseUrl: string): string | undefined {
  if (!databaseUrl.startsWith(PGLITE_PREFIX)) {
    return undefined;
  }
  const dataDir = databaseUrl.slice(PGLITE_PREFIX.length);
  return dataDir === IN_MEMORY_PGLITE ? undefined : `${dataDir}${SECRET_FILE_SUFFIX}`;
}

async function readStoredSecret(file: string): Promise<string | undefined> {
  try {
    const stored = (await readFile(file, 'utf8')).trim();
    return stored.length >= MIN_SECRET_LENGTH ? stored : undefined;
  } catch {
    return undefined;
  }
}

async function storedOrNewSecret(file: string): Promise<string> {
  const stored = await readStoredSecret(file);
  if (stored !== undefined) {
    return stored;
  }
  const secret = randomSecret();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${secret}\n`, { mode: OWNER_ONLY });
  return secret;
}

/**
 * The secret that signs session cookies. A hosted run must set AUTH_SECRET so every instance
 * shares it. A local pglite run without one keeps a generated secret next to the database, so
 * sessions survive a restart of the dev server.
 */
export async function resolveAuthSecret(config: SecretConfig, logger: Logger): Promise<string> {
  if (config.AUTH_SECRET !== '') {
    return config.AUTH_SECRET;
  }
  if (!config.DATABASE_URL.startsWith(PGLITE_PREFIX)) {
    throw new Error('AUTH_SECRET is required unless DATABASE_URL is pglite://');
  }
  const file = authSecretFile(config.DATABASE_URL);
  if (file === undefined) {
    logger.warn('AUTH_SECRET is empty, so sessions use a random secret until the API stops.');
    return randomSecret();
  }
  logger.warn(`AUTH_SECRET is empty, so sessions use the generated secret in ${file}.`);
  return storedOrNewSecret(file);
}

/** The synchronous fallback for in-memory deps: AUTH_SECRET, or a random one for this process. */
export function authSecretOrRandom(config: Pick<AppConfig, 'AUTH_SECRET'>): string {
  return config.AUTH_SECRET === '' ? randomSecret() : config.AUTH_SECRET;
}
