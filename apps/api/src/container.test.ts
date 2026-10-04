import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '@parkshape/config';
import { FakeClock } from '@parkshape/core';
import { LocalFsBlobStore } from '@parkshape/storage';

import { InlineMetricsRunner } from './adapters/inline-metrics-runner.js';
import { WorkerPoolMetricsRunner } from './adapters/worker-pool-metrics-runner.js';
import { createApiContainer, createInMemoryDeps, type ApiContainer } from './container.js';

const SHARED_SECRET = 'shared-secret-for-every-instance-0001';

describe('createInMemoryDeps', () => {
  it('lets a second instance read a session when both share AUTH_SECRET', async () => {
    const config = loadConfig({ AUTH_SECRET: SHARED_SECRET });
    const first = createInMemoryDeps(config);
    const second = createInMemoryDeps(config);
    const { setCookie } = await first.auth.createSession('user-1', 'resident');
    const cookie = setCookie.split(';')[0];
    expect(await second.auth.readSession(cookie)).toEqual({ userId: 'user-1', role: 'resident' });
  });

  it('marks the cookie Secure for a hosted web origin', async () => {
    const deps = createInMemoryDeps(
      loadConfig({
        AUTH_SECRET: SHARED_SECRET,
        CORS_ORIGIN: 'https://parkshape.example.ca',
        STAFF_ACCESS_CODE: 'container-test-code',
      }),
    );
    const { setCookie } = await deps.auth.createSession('user-1', 'resident');
    expect(setCookie).toMatch(/Secure/);
  });
});

const INTENT_COMPLETION = JSON.stringify({
  choices: [
    {
      message: {
        content: JSON.stringify({
          features: [],
          paths: { style: 'loop' },
          canopy: 'add-some',
          character: 'natural',
        }),
      },
    },
  ],
});

/** Gemini stand-in: the first model is out of quota, the fallback answers. */
function geminiStub() {
  const calls: { model: string; signal: AbortSignal | null | undefined }[] = [];
  const fetch = (_url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? init.body : '{}';
    const { model } = JSON.parse(body) as { model: string };
    calls.push({ model, signal: init?.signal });
    const limited = model === 'gemini-3.5-flash-lite';
    const reply = limited ? 'quota' : INTENT_COMPLETION;
    return Promise.resolve(new Response(reply, { status: limited ? 429 : 200 }));
  };
  return { fetch, calls };
}

describe('the AI model chain in the container', () => {
  it('gives each model call its own timeout, so the fallback gets the full time', async () => {
    const stub = geminiStub();
    const config = loadConfig({ AUTH_SECRET: SHARED_SECRET, AI_API_KEY: 'k' });
    const deps = createInMemoryDeps(config, {
      fetch: stub.fetch,
      logger: { warn: () => undefined },
    });
    expect(await deps.ai.intent.parse('a loop')).toMatchObject({
      source: 'model',
      model: 'gemini-3.1-flash-lite',
    });
    const [first, second] = stub.calls;
    expect(stub.calls.map((call) => call.model)).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
    ]);
    expect(first?.signal).toBeInstanceOf(AbortSignal);
    expect(second?.signal).toBeInstanceOf(AbortSignal);
    expect(second?.signal).not.toBe(first?.signal);
    expect(second?.signal?.aborted).toBe(false);
  });

  it('times the 429 cooldown on the container clock', async () => {
    const stub = geminiStub();
    const clock = new FakeClock(new Date('2026-10-03T12:00:00Z'));
    const config = loadConfig({ AUTH_SECRET: SHARED_SECRET, AI_API_KEY: 'k' });
    const logger = { warn: () => undefined };
    const deps = createInMemoryDeps(config, { fetch: stub.fetch, logger, clock });
    await deps.ai.intent.parse('first');
    clock.advance(60_000);
    await deps.ai.intent.parse('second');
    expect(stub.calls.map((call) => call.model)).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
    ]);
  });
});

describe('site context provider selection', () => {
  it('serves the recorded fixture by default', () => {
    const deps = createInMemoryDeps(loadConfig({ AUTH_SECRET: SHARED_SECRET }));
    expect(deps.siteContext.name).toBe('static');
  });

  it('builds the Vancouver Open Data and TransLink adapter for vancouver', () => {
    const config = loadConfig({ AUTH_SECRET: SHARED_SECRET, SITE_CONTEXT_PROVIDER: 'vancouver' });
    expect(createInMemoryDeps(config).siteContext.name).toBe('vancouver');
  });
});

describe('the API container on pglite', () => {
  let container: ApiContainer;

  // pglite starts in the hook, where vitest.config.ts gives it its budget.
  beforeAll(async () => {
    container = await createApiContainer(loadConfig({ DATABASE_URL: 'pglite://memory' }), {
      authSecret: SHARED_SECRET,
    });
  });

  afterAll(async () => {
    await container.close();
  });

  it('measures submits on worker threads in the API container', () => {
    expect(container.deps.metrics).toBeInstanceOf(WorkerPoolMetricsRunner);
  });

  it('serves element comments from pglite and the context from SITE_CONTEXT_PROVIDER', async () => {
    expect(await container.deps.repos.elementComments.countsByProject('no-such-project')).toEqual(
      [],
    );
    expect(container.deps.siteContext.name).toBe('static');
  });

  it('measures inline in the in-memory deps unless asked for the pool', () => {
    const config = loadConfig({ AUTH_SECRET: SHARED_SECRET });
    expect(createInMemoryDeps(config).metrics).toBeInstanceOf(InlineMetricsRunner);
    const pooled = createInMemoryDeps(config, { metrics: 'worker-pool' }).metrics;
    expect(pooled).toBeInstanceOf(WorkerPoolMetricsRunner);
    return pooled.close();
  });
});

describe('the local-fs blob store', () => {
  let blobDir: string;
  const containers: ApiContainer[] = [];

  beforeAll(async () => {
    blobDir = await mkdtemp(join(tmpdir(), 'parkshape-container-blobs-'));
    const config = loadConfig({
      DATABASE_URL: 'pglite://memory',
      BLOB_STORE: 'local-fs',
      BLOB_DIR: blobDir,
    });
    const start = () =>
      createApiContainer(config, { authSecret: SHARED_SECRET, metrics: 'inline' });
    // One container stands for the seed process, the other for the dev API.
    containers.push(await start(), await start());
  });

  afterAll(async () => {
    await Promise.all(containers.map((container) => container.close()));
    await rm(blobDir, { recursive: true, force: true });
  });

  it('lets a second process read what the first one wrote under the same BLOB_DIR', async () => {
    const [seed, api] = containers.map(({ deps }) => deps.blobStore);
    expect(api).toBeInstanceOf(LocalFsBlobStore);
    await seed?.put(
      'thumbnails/design-1/0123456789abcdef.png',
      new Uint8Array([1, 2]),
      'image/png',
    );
    const read = await api?.get('thumbnails/design-1/0123456789abcdef.png');
    expect(read).toEqual({ bytes: new Uint8Array([1, 2]), contentType: 'image/png' });
    expect(api?.url('thumbnails/design-1/0123456789abcdef.png')).toMatch(/\/blobs\/thumbnails\//);
  });
});
