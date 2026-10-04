import { ApiRequestError } from '@parkshape/api-client';
import { ELEMENT_COMMENT_MAX_CHARS } from '@parkshape/core';

import { failureCopyFor } from '../../api/error-copy';
import { format, messages } from '../../messages';
import { closingDate } from '../../pages/project-deadline';

const BAD_REQUEST = 400;
const CONFLICT = 409;
const RATE_LIMITED = 429;

export interface CommentFailureContext {
  /** The project's closing day, for the closed message. */
  readonly closesAt: string | null;
  /** The text that was sent, which the composer keeps. */
  readonly text: string;
}

interface RateLimitBody {
  readonly error?: { readonly retryAfterSeconds?: number };
}

function closedCopy(closesAt: string | null): string {
  const text = messages.review.failure;
  if (closesAt === null) return text.closedNoDate;
  return format(text.closed, { date: closingDate(closesAt, 'long') });
}

function refusedCopy(error: ApiRequestError, context: CommentFailureContext): string | null {
  const text = messages.review.failure;
  if (error.status === CONFLICT && error.kind === 'phase-closed')
    return closedCopy(context.closesAt);
  if (error.status === BAD_REQUEST) {
    return context.text.length > ELEMENT_COMMENT_MAX_CHARS
      ? format(text.tooLong, { max: ELEMENT_COMMENT_MAX_CHARS })
      : text.plainText;
  }
  if (error.status === RATE_LIMITED) {
    const seconds = (error.body as RateLimitBody | undefined)?.error?.retryAfterSeconds ?? 0;
    return format(text.tooMany, { seconds });
  }
  return null;
}

/**
 * The fact-then-action line for a comment that did not go through. Sign-in and server failures
 * read as they do everywhere else, from the CONTENT.md error table.
 */
export function commentFailure(error: unknown, context: CommentFailureContext): string {
  const refused = error instanceof ApiRequestError ? refusedCopy(error, context) : null;
  return refused ?? failureCopyFor(error, 'save').message;
}
