import { randomUUID } from 'node:crypto';

import { createAi, type Logger } from '@parkshape/ai';
import { MockAuthProvider, sessionCookieSecurity } from '@parkshape/auth';
import type { AppConfig } from '@parkshape/config';
import { INSIGHTS_CACHE_MS, SystemClock, type Clock } from '@parkshape/core';
import {
  InMemoryRateLimitStore,
  createInMemoryRepositories,
  startDatabase,
  type RateLimitStore,
  type Readiness,
  type Repositories,
  type StartDatabaseOptions,
} from '@parkshape/db';
import {
  InMemoryBlobStore,
  LocalFsBlobStore,
  SupabaseStorageBlobStore,
  type BlobStore,
} from '@parkshape/storage';
import {
  createSiteContextProvider,
  createSiteFeaturesProvider,
  createTerrainProvider,
  type HttpFetch,
} from '@parkshape/terrain';

import { InlineMetricsRunner } from './adapters/inline-metrics-runner.js';
import { WorkerPoolMetricsRunner } from './adapters/worker-pool-metrics-runner.js';
import { authSecretOrRandom, resolveAuthSecret } from './auth-secret.js';
import type { AppDeps } from './deps.js';
import { createLimits } from './limits.js';
import { offlineFetch } from './offline-fetch.js';
import type { MetricsRunner } from './ports/metrics-runner.js';
import { createQueueRandoms, createSeedCounter } from './rules/index.js';
import { TtlCache } from './ttl-cache.js';

// A model call that takes longer than this fails and the rule-based answer is used instead.
const AI_TIMEOUT_MS = 15_000;

/**
 * How long one instance reuses a project's ranked leaderboard: the web page's 5 s poll interval.
 * Votes and submits clear it at once on the instance that took them. On Vercel every function
 * instance keeps its own copy, so a read on another instance can lag a vote by up to 5 s, which
 * is no later than the next poll would show it anyway.
 */
export const LEADERBOARD_CACHE_MS = 5000;

/** Test and tooling hooks; production uses the system clock and random ids. */
export interface ContainerOverrides {
  readonly clock?: Clock;
  /** Base seed for the review queue and for Describe it layouts; defaults to the start time. */
  readonly queueSeed?: number;
  readonly newId?: () => string;
  /** Signs session cookies; defaults to AUTH_SECRET, or a generated one for local pglite. */
  readonly authSecret?: string;
  /** Where the API reports fallbacks such as a generated session secret. */
  readonly logger?: Logger;
  /** The fetch the network providers use; defaults to the runtime's own. */
  readonly fetch?: HttpFetch;
  /**
   * Where submits are measured: worker threads by default in createApiContainer, the calling
   * thread by default in createInMemoryDeps. Integration tests pick inline to skip thread start-up.
   */
  readonly metrics?: MetricsRunnerKind;
  /** Replaces the store BLOB_STORE picks; recovery tests pass one that fails on demand. */
  readonly blobStore?: BlobStore;
  /** How the first connection is retried and opened; recovery tests fake a refusing server. */
  readonly database?: Omit<StartDatabaseOptions, 'logger'>;
}

export type MetricsRunnerKind = 'inline' | 'worker-pool';

function createMetricsRunner(kind: MetricsRunnerKind): MetricsRunner {
  return kind === 'inline' ? new InlineMetricsRunner() : new WorkerPoolMetricsRunner();
}

export interface ApiContainer {
  readonly deps: AppDeps;
  /** Settles when the database opens, or rejects once the boot retries run out. */
  readonly databaseReady: Promise<void>;
  close(): Promise<void>;
}

type ContainerConfig = Pick<
  AppConfig,
  | 'CORS_ORIGIN'
  | 'DATABASE_URL'
  | 'VITE_API_URL'
  | 'RATE_LIMIT_VOTES_PER_MINUTE'
  | 'RATE_LIMIT_SUBMISSIONS_PER_HOUR'
  | 'RATE_LIMIT_LOGINS_PER_MINUTE'
  | 'RATE_LIMIT_INTENTS_PER_MINUTE'
  | 'RATE_LIMIT_DRAFT_SAVES_PER_MINUTE'
  | 'RATE_LIMIT_THUMBNAILS_PER_HOUR'
  | 'RATE_LIMIT_COMMENTS_PER_MINUTE'
  | 'RATE_LIMIT_STORE'
  | 'TRUST_PROXY'
  | 'AUTH_SECRET'
  | 'AUTH_COOKIE_SECURE'
  | 'STAFF_ACCESS_CODE'
  | 'staffLoginMode'
  | 'TERRAIN_PROVIDER'
  | 'SITE_FEATURES_PROVIDER'
  | 'SITE_CONTEXT_PROVIDER'
  | 'AI_PROVIDER'
  | 'AI_BASE_URL'
  | 'AI_API_KEY'
  | 'AI_MODEL'
  | 'AI_FALLBACK_MODEL'
  | 'FEATURE_SUMMARY'
  | 'FEATURE_DESCRIBE_IT'
  | 'BLOB_STORE'
  | 'BLOB_DIR'
  | 'SUPABASE_URL'
  | 'SUPABASE_SERVICE_KEY'
  | 'SUPABASE_BUCKET'
  | 'PARKSHAPE_OFFLINE'
>;

/** The Logger port over the console; the Node entry uses it for lifecycle and fatal lines. */
export const consoleLogger: Logger = {
  warn: (message) => {
    console.warn(message);
  },
};

/** The fetch every network adapter shares; offline mode swaps in one that always fails. */
function networkFetch(config: ContainerConfig, overrides: ContainerOverrides): HttpFetch {
  if (config.PARKSHAPE_OFFLINE === '1') {
    return offlineFetch;
  }
  return overrides.fetch ?? globalThis.fetch.bind(globalThis);
}

function selectBlobStore(config: ContainerConfig, fetch: HttpFetch): BlobStore {
  // Browsers always read blobs through the API's /blobs route, whichever store holds them.
  const publicBaseUrl = `${config.VITE_API_URL}/blobs`;
  switch (config.BLOB_STORE) {
    case 'memory':
      return new InMemoryBlobStore({ baseUrl: publicBaseUrl });
    case 'local-fs':
      // Files on disk, so the seed process and the dev API share what either one writes.
      return new LocalFsBlobStore({ rootDir: config.BLOB_DIR, baseUrl: publicBaseUrl });
    case 'supabase':
      return new SupabaseStorageBlobStore({
        projectUrl: config.SUPABASE_URL,
        serviceKey: config.SUPABASE_SERVICE_KEY,
        bucket: config.SUPABASE_BUCKET,
        publicBaseUrl,
        fetch,
      });
  }
}

/** The database's shared buckets for postgres; one process's own buckets for memory. */
function selectRateLimitStore(
  config: ContainerConfig,
  database: { readonly rateLimitStore: RateLimitStore } | undefined,
): RateLimitStore {
  switch (config.RATE_LIMIT_STORE) {
    case 'memory':
      return new InMemoryRateLimitStore();
    case 'postgres':
      if (database === undefined) {
        throw new Error('RATE_LIMIT_STORE=postgres needs a database; these deps have none.');
      }
      return database.rateLimitStore;
  }
}

interface ResolvedOverrides extends ContainerOverrides {
  readonly clock: Clock;
  readonly newId: () => string;
  readonly authSecret: string;
  readonly logger: Logger;
}

interface Stores {
  readonly repos: Repositories;
  readonly readiness: () => Promise<Readiness>;
  readonly rateLimitStore: RateLimitStore;
  readonly metrics: MetricsRunner;
}

function composeDeps(
  config: ContainerConfig,
  { repos, readiness, rateLimitStore, metrics }: Stores,
  overrides: ResolvedOverrides,
): AppDeps {
  const { clock, newId, logger } = overrides;
  // The composition root is the one place that hands the runtime's fetch to the providers.
  const fetch = networkFetch(config, overrides);
  const blobStore = overrides.blobStore ?? selectBlobStore(config, fetch);
  const providerDeps = { fetch, cache: blobStore };
  return {
    config,
    repos,
    readiness,
    auth: new MockAuthProvider({
      secret: overrides.authSecret,
      clock,
      cookieSecurity: sessionCookieSecurity(config),
    }),
    blobStore,
    terrain: createTerrainProvider(config, providerDeps),
    siteFeatures: createSiteFeaturesProvider(config, providerDeps),
    siteContext: createSiteContextProvider(config, { ...providerDeps, clock }),
    ai: createAi(config, {
      // A new signal per fetch call, so a fallback model asked after a slow 429 gets the full time.
      fetch: (url, init) =>
        providerDeps.fetch(url, { ...init, signal: AbortSignal.timeout(AI_TIMEOUT_MS) }),
      logger,
      clock,
    }),
    clock,
    queueRandom: createQueueRandoms(overrides.queueSeed ?? clock.now().getTime()),
    layoutSeed: createSeedCounter(overrides.queueSeed ?? clock.now().getTime()),
    rateLimitStore,
    limits: createLimits(config, { clock, store: rateLimitStore }),
    metrics,
    insightsCache: new TtlCache({ clock, ttlMs: INSIGHTS_CACHE_MS }),
    leaderboardCache: new TtlCache({ clock, ttlMs: LEADERBOARD_CACHE_MS }),
    newRequestId: newId,
    logger,
    newBlobId: newId,
  };
}

/** Builds the adapters named by config; the only place the API picks an adapter. */
export async function createApiContainer(
  config: ContainerConfig,
  overrides: ContainerOverrides = {},
): Promise<ApiContainer> {
  const clock = overrides.clock ?? new SystemClock();
  const newId = overrides.newId ?? randomUUID;
  const logger = overrides.logger ?? consoleLogger;
  const authSecret = overrides.authSecret ?? (await resolveAuthSecret(config, logger));
  // A database that refuses at boot does not stop the API: /health answers, /ready says 503.
  const database = await startDatabase(config, { clock, newId }, { ...overrides.database, logger });
  const metrics = createMetricsRunner(overrides.metrics ?? 'worker-pool');
  const rateLimitStore = selectRateLimitStore(config, database);
  const stores = {
    repos: database,
    readiness: () => database.readiness(),
    rateLimitStore,
    metrics,
  };
  return {
    deps: composeDeps(config, stores, { ...overrides, clock, newId, logger, authSecret }),
    databaseReady: database.ready,
    close: async () => {
      await metrics.close();
      await database.close();
    },
  };
}

/** Deps over in-memory repositories, for the OpenAPI generator and fast unit tests. */
export function createInMemoryDeps(
  config: ContainerConfig,
  overrides: ContainerOverrides = {},
): AppDeps {
  const clock = overrides.clock ?? new SystemClock();
  const newId = overrides.newId ?? randomUUID;
  const repos = createInMemoryRepositories({ clock, newId });
  const rateLimitStore = selectRateLimitStore(config, undefined);
  const metrics = createMetricsRunner(overrides.metrics ?? 'inline');
  const readiness = () => Promise.resolve<Readiness>({ kind: 'ready' });
  return composeDeps(
    config,
    { repos, readiness, rateLimitStore, metrics },
    {
      ...overrides,
      clock,
      newId,
      logger: overrides.logger ?? consoleLogger,
      authSecret: overrides.authSecret ?? authSecretOrRandom(config),
    },
  );
}
