import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '@parkshape/config';
import { refusingConnection } from '@parkshape/db/testing';

import { createApp } from '../../src/app.js';
import { createApiContainer, type ApiContainer } from '../../src/container.js';
import type { ApiApp } from '../../src/deps.js';

const SECRET = 'recovery-test-secret-of-32-characters';
const OK = 200;
const UNAVAILABLE = 503;

/** A retry wait the test releases by hand. */
function manualWait() {
  const releases: (() => void)[] = [];
  return {
    wait: () => new Promise<void>((resolve) => releases.push(resolve)),
    release: () => releases.shift()?.(),
  };
}

const lines: string[] = [];
const clock = manualWait();
let container: ApiContainer;
let app: ApiApp;

beforeAll(async () => {
  container = await createApiContainer(loadConfig({ DATABASE_URL: 'pglite://memory' }), {
    authSecret: SECRET,
    metrics: 'inline',
    logger: { warn: (line) => lines.push(line) },
    database: { connect: refusingConnection({ refusals: 1 }), wait: clock.wait },
  });
  app = createApp(container.deps);
});

afterAll(async () => {
  await container.close();
});

describe('the API while its database refuses connections at boot', () => {
  it('starts, and /health says the process is alive', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(OK);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('answers /ready with 503, a plain message and a retry hint', async () => {
    const response = await app.request('/ready');
    expect(response.status).toBe(UNAVAILABLE);
    expect(response.headers.get('Retry-After')).toMatch(/^\d+$/);
    const body = (await response.json()) as { error: { kind: string; message: string } };
    expect(body.error.kind).toBe('databaseUnavailable');
    expect(body.error.message).toMatch(/database/i);
  });

  it('answers a route that needs the database with 503, not 500', async () => {
    const response = await app.request('/projects');
    expect(response.status).toBe(UNAVAILABLE);
  });

  it('logs the failed attempt through the Logger port', () => {
    expect(lines.some((line) => line.includes('attempt 1'))).toBe(true);
  });

  it('answers /ready with 200 once a retry connects', async () => {
    clock.release();
    await container.databaseReady;
    const response = await app.request('/ready');
    expect(response.status).toBe(OK);
    expect(await response.json()).toEqual({ ready: true });
    expect((await app.request('/projects')).status).toBe(OK);
  });
});
