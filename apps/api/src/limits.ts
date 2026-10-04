import type { AppConfig } from '@parkshape/config';
import type { Clock } from '@parkshape/core';
import type { RateLimitStore } from '@parkshape/db';

import { TokenBucketLimiter } from './rate-limit.js';

const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const HOUR_MS = MINUTES_PER_HOUR * MINUTE_MS;

type LimitConfig = Pick<
  AppConfig,
  | 'RATE_LIMIT_VOTES_PER_MINUTE'
  | 'RATE_LIMIT_SUBMISSIONS_PER_HOUR'
  | 'RATE_LIMIT_LOGINS_PER_MINUTE'
  | 'RATE_LIMIT_INTENTS_PER_MINUTE'
  | 'RATE_LIMIT_DRAFT_SAVES_PER_MINUTE'
  | 'RATE_LIMIT_THUMBNAILS_PER_HOUR'
  | 'RATE_LIMIT_COMMENTS_PER_MINUTE'
>;

/** One token bucket per limited action. Sign-ins are keyed by address, the rest by person. */
export interface Limits {
  readonly votes: TokenBucketLimiter;
  readonly submissions: TokenBucketLimiter;
  readonly logins: TokenBucketLimiter;
  readonly intents: TokenBucketLimiter;
  readonly draftSaves: TokenBucketLimiter;
  readonly thumbnails: TokenBucketLimiter;
  readonly comments: TokenBucketLimiter;
}

export interface LimitDeps {
  readonly clock: Clock;
  readonly store: RateLimitStore;
}

export function createLimits(config: LimitConfig, { clock, store }: LimitDeps): Limits {
  const bucket = (name: keyof Limits, capacity: number, windowMs: number) =>
    new TokenBucketLimiter({ name, capacity, windowMs, clock, store });
  return {
    votes: bucket('votes', config.RATE_LIMIT_VOTES_PER_MINUTE, MINUTE_MS),
    submissions: bucket('submissions', config.RATE_LIMIT_SUBMISSIONS_PER_HOUR, HOUR_MS),
    logins: bucket('logins', config.RATE_LIMIT_LOGINS_PER_MINUTE, MINUTE_MS),
    intents: bucket('intents', config.RATE_LIMIT_INTENTS_PER_MINUTE, MINUTE_MS),
    draftSaves: bucket('draftSaves', config.RATE_LIMIT_DRAFT_SAVES_PER_MINUTE, MINUTE_MS),
    thumbnails: bucket('thumbnails', config.RATE_LIMIT_THUMBNAILS_PER_HOUR, HOUR_MS),
    comments: bucket('comments', config.RATE_LIMIT_COMMENTS_PER_MINUTE, MINUTE_MS),
  };
}
