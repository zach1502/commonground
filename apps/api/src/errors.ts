import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { DatabaseUnavailableError } from '@parkshape/db';
import { InvalidBlobKeyError } from '@parkshape/storage';
import type { SiteFeaturesError, TerrainError } from '@parkshape/terrain';

/** One failed hard constraint, as shown to the author when a submit is refused. */
export interface HardFailure {
  readonly key: string;
  readonly detail: string;
}

export type ApiErrorKind =
  | 'validation'
  | 'unauthenticated'
  | 'forbidden'
  | 'access-code-refused'
  | 'not-found'
  | 'phase-closed'
  | 'wrong-status'
  | 'liveCapReached'
  | 'projectExists'
  | 'hard-constraints'
  | 'rate-limited'
  | 'payload-too-large'
  | 'site-data-unavailable'
  | 'upstream-failed'
  | 'feature-off'
  | 'databaseUnavailable'
  | 'storageUnavailable'
  | 'metricsUnavailable'
  | 'contextUnavailable';

const STATUS_BY_KIND: Readonly<Record<ApiErrorKind, ContentfulStatusCode>> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  'access-code-refused': 403,
  'not-found': 404,
  'phase-closed': 409,
  'wrong-status': 409,
  liveCapReached: 422,
  projectExists: 409,
  'hard-constraints': 422,
  'rate-limited': 429,
  'payload-too-large': 413,
  'site-data-unavailable': 422,
  'upstream-failed': 502,
  'feature-off': 503,
  databaseUnavailable: 503,
  storageUnavailable: 503,
  metricsUnavailable: 503,
  contextUnavailable: 503,
};

export interface ApiErrorDetails {
  readonly failures?: readonly HardFailure[];
  readonly retryAfterSeconds?: number;
  readonly issues?: readonly { readonly path: string; readonly message: string }[];
}

/** An error with a kind the error middleware turns into one HTTP status and body. */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly details: ApiErrorDetails = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = STATUS_BY_KIND[kind];
  }
}

export const unauthenticated = () => new ApiError('unauthenticated', 'Sign in to do this.');
export const forbidden = (message: string) => new ApiError('forbidden', message);
export const accessCodeRefused = () =>
  new ApiError(
    'access-code-refused',
    'The access code is missing or wrong. Ask the project lead for the code.',
  );
export const notFound = (thing: string) => new ApiError('not-found', `${thing} was not found.`);
export const phaseClosed = () =>
  new ApiError('phase-closed', 'This project is closed, so designs and votes are locked.');
export const wrongStatus = (message: string) => new ApiError('wrong-status', message);
export const projectExists = (name: string) =>
  new ApiError(
    'projectExists',
    `You already have a project named ${name}. Open it from the project list, or pick another name.`,
  );
export const featureOff = (feature: string) =>
  new ApiError('feature-off', `${feature} is turned off for this site.`);

type SiteDataError = TerrainError | SiteFeaturesError;

/** Terrain and site-feature provider errors, mapped to one API error kind each. */
export function siteDataError(error: SiteDataError): ApiError {
  switch (error.kind) {
    case 'parkNotFound':
      return notFound(`A park named ${error.parkName}`);
    case 'invalidRequest':
      return new ApiError('validation', `The request is not valid: ${error.reason}.`);
    case 'network':
    case 'httpStatus':
    case 'invalidResponse':
      return new ApiError('upstream-failed', `The data source at ${error.url} did not answer.`);
    default:
      return new ApiError(
        'site-data-unavailable',
        `No elevation data covers this area (${error.kind}). Draw an outline inside B.C.`,
      );
  }
}

/** Seconds a client waits before retrying a request that met a backing service outage. */
export const OUTAGE_RETRY_AFTER_SECONDS = 5;

export const databaseUnavailable = () =>
  new ApiError(
    'databaseUnavailable',
    'The database is not answering right now. Try again in a few seconds.',
    { retryAfterSeconds: OUTAGE_RETRY_AFTER_SECONDS },
  );

export const storageUnavailable = () =>
  new ApiError(
    'storageUnavailable',
    'Picture storage is not answering right now. Try again in a few seconds.',
    { retryAfterSeconds: OUTAGE_RETRY_AFTER_SECONDS },
  );

/** A submit whose measurement timed out or whose worker died; the pool has a fresh worker. */
export const metricsUnavailable = (what: string) =>
  new ApiError('metricsUnavailable', `${what} Try the submit again in a few seconds.`, {
    retryAfterSeconds: OUTAGE_RETRY_AFTER_SECONDS,
  });

/** The street and transit sources did not answer; nothing was cached, so a retry fetches again. */
export const contextUnavailable = () =>
  new ApiError('contextUnavailable', 'Street data did not load. Try again in a few seconds.', {
    retryAfterSeconds: OUTAGE_RETRY_AFTER_SECONDS,
  });

/**
 * Runs a blob store call and reports any failure as a storage outage. A bad key is the
 * caller's mistake, so InvalidBlobKeyError passes through for the caller to answer 404.
 */
export async function fromBlobStore<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof InvalidBlobKeyError) throw error;
    throw storageUnavailable();
  }
}

/** Outages from the adapters, as API errors; undefined for anything else. */
export function outageError(error: unknown): ApiError | undefined {
  if (error instanceof DatabaseUnavailableError) return databaseUnavailable();
  return undefined;
}
