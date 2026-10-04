import { loadConfig, loadConfigFromProcess, type EnvSource } from '@parkshape/config';
import { FakeClock } from '@parkshape/core';
import type { Repositories } from '@parkshape/db';
import { createScratchDatabase } from '@parkshape/db/testing';
import type { BlobStore } from '@parkshape/storage';

import { createApp } from '../src/app.js';
import {
  createApiContainer,
  createInMemoryDeps,
  type ApiContainer,
  type MetricsRunnerKind,
} from '../src/container.js';
import type { ApiApp, AppDeps } from '../src/deps.js';

export const STAFF = 'persona-paula-blueprint';
export const BOB = 'persona-bob-walksadog';
export const MOLLY = 'persona-molly-swingset';
export const KEVIN = 'persona-kevin-kickabout';
export const SALLY = 'persona-sally-smoothpath';

export const START = new Date('2026-09-25T09:00:00.000Z');
const QUEUE_SEED = 42;
// A fixed value that signs test sessions only; gitleaks reads it as a key, so it is allowed here.
export const TEST_AUTH_SECRET = 'integration-test-secret-of-32-characters'; // gitleaks:allow
// Empty runs the API on pglite. A postgres:// URL gives each test file its own database there.
const SERVER_URL = loadConfigFromProcess().PARKSHAPE_TEST_DATABASE_URL;

interface TestDatabase {
  readonly env: EnvSource;
  drop(): Promise<void>;
}

async function testDatabase(): Promise<TestDatabase> {
  if (SERVER_URL === '') {
    return { env: { DATABASE_URL: 'pglite://memory' }, drop: () => Promise.resolve() };
  }
  const scratch = await createScratchDatabase(SERVER_URL);
  // A postgres:// DATABASE_URL needs AUTH_SECRET; the container gets the same secret below.
  return {
    env: { DATABASE_URL: scratch.url, AUTH_SECRET: TEST_AUTH_SECRET },
    drop: () => scratch.drop(),
  };
}

export interface CallOptions {
  readonly cookie?: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

export interface CallResult {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
}

export interface Harness {
  readonly app: ApiApp;
  readonly deps: AppDeps;
  readonly clock: FakeClock;
  readonly databaseUrl: string;
  call(method: string, path: string, options?: CallOptions): Promise<CallResult>;
  login(persona: string): Promise<string>;
  close(): Promise<void>;
}

export interface HarnessOptions {
  /** Inline by default, so a test file starts no threads; the offload test asks for the pool. */
  readonly metrics?: MetricsRunnerKind;
  /** Replaces the store BLOB_STORE picks; recovery tests pass one that fails on demand. */
  readonly blobStore?: BlobStore;
  /** Wraps the repositories the routes see; consistency tests open race windows through it. */
  readonly repos?: (inner: Repositories) => Repositories;
  /** `memory` runs the routes on the in-memory repositories instead of pglite or the server. */
  readonly store?: 'database' | 'memory';
}

interface Backing {
  readonly container: Pick<ApiContainer, 'deps' | 'close'>;
  readonly databaseUrl: string;
  drop(): Promise<void>;
}

async function backingFor(
  env: EnvSource,
  options: HarnessOptions,
  overrides: Parameters<typeof createApiContainer>[1],
): Promise<Backing> {
  if (options.store === 'memory') {
    const config = loadConfig({ ...env, DATABASE_URL: 'pglite://memory' });
    const deps = createInMemoryDeps(config, overrides);
    const close = () => deps.metrics.close();
    return { container: { deps, close }, databaseUrl: 'memory', drop: () => Promise.resolve() };
  }
  const database = await testDatabase();
  const config = loadConfig({ ...database.env, ...env });
  const container = await createApiContainer(config, overrides);
  return { container, databaseUrl: config.DATABASE_URL, drop: () => database.drop() };
}

/** A fresh API over its own database, in-memory pglite by default; call once per test file. */
export async function startHarness(
  env: EnvSource = {},
  options: HarnessOptions = {},
): Promise<Harness> {
  const clock = new FakeClock(START);
  let next = 0;
  const newId = () => {
    next += 1;
    return `id-${String(next).padStart(5, '0')}`;
  };
  const backing = await backingFor(env, options, {
    clock,
    newId,
    queueSeed: QUEUE_SEED,
    authSecret: TEST_AUTH_SECRET,
    metrics: options.metrics ?? 'inline',
    ...(options.blobStore === undefined ? {} : { blobStore: options.blobStore }),
  });
  const { container } = backing;
  const deps =
    options.repos === undefined
      ? container.deps
      : { ...container.deps, repos: options.repos(container.deps.repos) };
  const app = createApp(deps);

  const call = async (method: string, path: string, options: CallOptions = {}) => {
    const headers: Record<string, string> = { ...options.headers };
    if (options.cookie !== undefined) headers.Cookie = options.cookie;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const init: RequestInit = { method, headers };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    const response = await app.request(path, init);
    const text = await response.text();
    return {
      status: response.status,
      body: text === '' ? undefined : (JSON.parse(text) as unknown),
      headers: response.headers,
    };
  };

  const login = async (persona: string) => {
    const response = await call('POST', '/auth/login', { body: { persona } });
    const setCookie = response.headers.get('Set-Cookie') ?? '';
    return setCookie.split(';')[0] ?? '';
  };

  const close = async () => {
    await container.close();
    await backing.drop();
  };
  return { app, deps, clock, databaseUrl: backing.databaseUrl, call, login, close };
}

/** The error kind in an error body, for short assertions. */
export function errorKind(body: unknown): string | undefined {
  const error = (body as { error?: { kind?: string } } | undefined)?.error;
  return error?.kind;
}
