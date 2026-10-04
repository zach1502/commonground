import { ApiRequestError } from '@parkshape/api-client';

import { format, messages } from '../messages';

/** Where a failure happened, so a shared kind such as a rate limit reads for that surface. */
export type FailureContext = 'save' | 'submit' | 'vote' | 'login' | 'start' | 'load';

/** The recovery a surface offers after a failure; each keeps the person's work. */
export type RecoveryAction = 'retry' | 'signIn' | 'wait' | 'reduceItems' | 'pickVersion' | 'goVote';

export interface FailureCopy {
  /** The fact sentence then the action sentence, from the CONTENT.md error table. */
  readonly message: string;
  readonly action: RecoveryAction;
  /** Seconds to wait before the action works again, for a rate limit; null otherwise. */
  readonly waitSeconds: number | null;
}

const UNAUTHORIZED = 401;
const CONFLICT = 409;
const PAYLOAD_TOO_LARGE = 413;
const RATE_LIMITED = 429;

interface RateLimitBody {
  readonly error?: { readonly retryAfterSeconds?: number };
}

/** The Retry-After seconds the API sent with a rate limit, or null when it sent none. */
function retryAfterOf(error: ApiRequestError): number | null {
  const body = error.body as RateLimitBody | undefined;
  return body?.error?.retryAfterSeconds ?? null;
}

function rateLimitCopy(error: ApiRequestError, context: FailureContext): FailureCopy {
  const seconds = retryAfterOf(error) ?? 0;
  const template =
    context === 'login' ? messages.failure.tooManySignIn : messages.failure.tooManyVotes;
  return { message: format(template, { seconds }), action: 'wait', waitSeconds: seconds };
}

const SERVER_ERROR: FailureCopy = {
  message: messages.failure.serverError,
  action: 'retry',
  waitSeconds: null,
};

function apiCopy(error: ApiRequestError, context: FailureContext): FailureCopy {
  if (error.status === UNAUTHORIZED) {
    return { message: messages.failure.signedOut, action: 'signIn', waitSeconds: null };
  }
  if (error.status === RATE_LIMITED) return rateLimitCopy(error, context);
  if (error.status === PAYLOAD_TOO_LARGE) {
    return { message: messages.failure.designTooLarge, action: 'reduceItems', waitSeconds: null };
  }
  if (error.status === CONFLICT) return conflictCopy(error);
  return SERVER_ERROR;
}

function conflictCopy(error: ApiRequestError): FailureCopy {
  if (error.kind === 'draftChanged') {
    return { message: messages.failure.savedElsewhere, action: 'pickVersion', waitSeconds: null };
  }
  if (error.kind === 'phase-closed') {
    return { message: messages.failure.projectClosed, action: 'goVote', waitSeconds: null };
  }
  return { message: messages.failure.changedDuringSubmit, action: 'retry', waitSeconds: null };
}

/**
 * Turns a failed request into the fact-then-action copy for the surface it happened on, plus the
 * recovery the surface should offer. An unknown error reads as a transient server error.
 */
export function failureCopyFor(error: unknown, context: FailureContext): FailureCopy {
  if (error instanceof ApiRequestError) return apiCopy(error, context);
  return SERVER_ERROR;
}
