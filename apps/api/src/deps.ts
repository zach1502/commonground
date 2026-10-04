import type { OpenAPIHono } from '@hono/zod-openapi';

import type { Ai, Logger } from '@parkshape/ai';
import type { AuthProvider, Session } from '@parkshape/auth';
import type { AppConfig } from '@parkshape/config';
import type { Clock } from '@parkshape/core';
import type { RateLimitStore, Readiness, Repositories } from '@parkshape/db';
import type { BlobStore } from '@parkshape/storage';
import type {
  SiteContextProvider,
  SiteFeaturesProvider,
  TerrainProvider,
} from '@parkshape/terrain';

import type { InsightsBody } from './contracts/insights.js';
import type { Limits } from './limits.js';
import type { MetricsRunner } from './ports/metrics-runner.js';
import type { RankedBoard } from './ranked-board.js';
import type { QueueRandomSource } from './rules/index.js';
import type { TtlCache } from './ttl-cache.js';

/** Everything the routes need, built once by createApiContainer. */
export interface AppDeps {
  readonly config: Pick<
    AppConfig,
    | 'CORS_ORIGIN'
    | 'FEATURE_SUMMARY'
    | 'FEATURE_DESCRIBE_IT'
    | 'AI_PROVIDER'
    | 'STAFF_ACCESS_CODE'
    | 'staffLoginMode'
    | 'TRUST_PROXY'
  >;
  readonly repos: Repositories;
  /** Whether the database answers now; /ready reports it. In-memory repositories always do. */
  readonly readiness: () => Promise<Readiness>;
  readonly auth: AuthProvider;
  readonly blobStore: BlobStore;
  /** Elevation grids for new projects, picked by TERRAIN_PROVIDER. */
  readonly terrain: TerrainProvider;
  /** Park outlines and existing features, picked by SITE_FEATURES_PROVIDER. */
  readonly siteFeatures: SiteFeaturesProvider;
  /** Streets, sidewalks, stops, parking and bikeways around a parcel, picked by SITE_CONTEXT_PROVIDER. */
  readonly siteContext: SiteContextProvider;
  /** Summary and describe-it providers, picked by AI_PROVIDER with rule-based fallbacks. */
  readonly ai: Ai;
  readonly clock: Clock;
  /** A fresh seeded Random for each review queue request. */
  readonly queueRandom: QueueRandomSource;
  /** The next layout seed for a Describe it draft that did not give one. */
  readonly layoutSeed: () => number;
  /** Token buckets behind every limit, picked by RATE_LIMIT_STORE. */
  readonly rateLimitStore: RateLimitStore;
  readonly limits: Limits;
  /** Runs computeMetrics for submits: worker threads in the API, inline in unit tests. */
  readonly metrics: MetricsRunner;
  /** Computed insights per project, reused for INSIGHTS_CACHE_MS. */
  readonly insightsCache: TtlCache<InsightsBody>;
  /** Each project's ranked live designs, reused for LEADERBOARD_CACHE_MS and cleared on votes. */
  readonly leaderboardCache: TtlCache<RankedBoard>;
  readonly newRequestId: () => string;
  /** Where failed requests are logged: one line each, with no stack or query parameters. */
  readonly logger: Logger;
  /** Ids for stored blobs such as heightmaps. */
  readonly newBlobId: () => string;
}

export interface AppEnv {
  Variables: {
    requestId: string;
    session: Session | undefined;
  };
}

export type ApiApp = OpenAPIHono<AppEnv>;
