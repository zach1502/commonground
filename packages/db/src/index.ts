import type { AppConfig } from '@parkshape/config';

export type DatabaseDriver = 'pglite' | 'postgres';

/** Chooses the driver from the DATABASE_URL scheme. */
export function databaseDriver(config: Pick<AppConfig, 'DATABASE_URL'>): DatabaseDriver {
  return config.DATABASE_URL.startsWith('pglite://') ? 'pglite' : 'postgres';
}

export type {
  Design,
  DesignStatus,
  DesignSummary,
  QueueCandidate,
  VoteTarget,
  JsonObject,
  Project,
  ProjectStatus,
  RepositoryDeps,
  User,
  UserRole,
  Vote,
  VoteValue,
} from './ports/records.js';
export { MissingReferenceError, PhaseClosedError } from './ports/repositories.js';
export type { Repositories } from './ports/repositories.js';
export type {
  DesignRepository,
  DraftChanges,
  NewDesign,
  SubmitInput,
  SubmitResult,
} from './ports/design-repository.js';
export type {
  CreateDraftResult,
  CreateVersionResult,
  DraftSource,
  NewDraft,
  ProjectStatusChange,
  ProjectStatusResult,
  ThumbnailAttach,
  ThumbnailResult,
} from './ports/guarded-writes.js';
export type {
  CreateProjectResult,
  NewProject,
  ProjectRepository,
} from './ports/project-repository.js';
export type { UpsertUser, UserRepository } from './ports/user-repository.js';
export type {
  CastVote,
  ProjectVoteTotals,
  UpsertedVote,
  VoteRepository,
  WithdrawVote,
  WithdrawnVote,
} from './ports/vote-repository.js';
export type {
  CommentChange,
  CommentEdit,
  CommentListOptions,
  CommentResolve,
  CommentVisibility,
  ElementCommentCount,
  ElementCommentRepository,
  OpenComment,
  UpsertedComment,
} from './ports/element-comment-repository.js';
export type { RateLimitStore, TakeOptions, TakeResult } from './ports/rate-limit-store.js';
export { createDatabase } from './adapters/drizzle/index.js';
export type { Database } from './adapters/drizzle/index.js';
export {
  DATABASE_QUERY_TIMEOUT_MS,
  DATABASE_RETRY,
  startDatabase,
} from './adapters/drizzle/start.js';
export type {
  RetryPolicy,
  RetryWait,
  StartDatabaseOptions,
  StartedDatabase,
} from './adapters/drizzle/start.js';
export { DatabaseUnavailableError } from './ports/availability.js';
export type { DatabaseLogger, Readiness, UnavailableReason } from './ports/availability.js';
export { createInMemoryRepositories } from './adapters/memory/index.js';
export { InMemoryRateLimitStore } from './adapters/rate-limit/in-memory-rate-limit-store.js';
export { PostgresRateLimitStore } from './adapters/rate-limit/postgres-rate-limit-store.js';
