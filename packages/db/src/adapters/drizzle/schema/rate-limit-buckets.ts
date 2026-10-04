import { bigint, doublePrecision, pgTable, text } from 'drizzle-orm/pg-core';

/** One token bucket per limited action and caller, shared by every API instance. */
export const rateLimitBuckets = pgTable('rate_limit_buckets', {
  key: text('key').primaryKey(),
  tokens: doublePrecision('tokens').notNull(),
  updatedMs: bigint('updated_ms', { mode: 'number' }).notNull(),
});
