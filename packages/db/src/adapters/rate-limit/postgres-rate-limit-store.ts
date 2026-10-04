import { eq, sql } from 'drizzle-orm';

import {
  limitedResult,
  refillPerMs,
  refilledTokens,
  type RateLimitStore,
  type TakeOptions,
  type TakeResult,
} from '../../ports/rate-limit-store.js';
import type { DrizzleDb } from '../drizzle/pglite.js';
import { rateLimitBuckets } from '../drizzle/schema/index.js';

/** The placeholders a take or refund binds, and the stored row refilled up to now. */
function bucketTerms() {
  const { tokens, updatedMs } = rateLimitBuckets;
  const nowMs = sql`${sql.placeholder('nowMs')}::bigint`;
  const capacity = sql`${sql.placeholder('capacity')}::double precision`;
  const rate = sql`${sql.placeholder('refillPerMs')}::double precision`;
  const elapsedMs = sql`greatest(0, ${nowMs} - ${updatedMs})`;
  const refilled = sql`least(${capacity}, ${tokens} + ${elapsedMs} * ${rate})`;
  return { nowMs, capacity, refilled, laterMs: sql`greatest(${updatedMs}, ${nowMs})` };
}

/** The take's upsert, built once per database since every vote and submit runs it. */
function prepareSpend(db: DrizzleDb) {
  const { tokens } = rateLimitBuckets;
  const { nowMs, refilled, laterMs } = bucketTerms();
  return db
    .insert(rateLimitBuckets)
    .values({
      key: sql.placeholder('key'),
      tokens: sql`${sql.placeholder('firstTokens')}::double precision`,
      updatedMs: nowMs,
    })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: { tokens: sql`${refilled} - 1`, updatedMs: laterMs },
      setWhere: sql`${refilled} >= 1`,
    })
    .returning({ tokens })
    .prepare('rate_limit_spend');
}

/** The refund's update: one row lock, like a take, so a refund and a take cannot interleave. */
function prepareRefund(db: DrizzleDb) {
  const { capacity, refilled, laterMs } = bucketTerms();
  return db
    .update(rateLimitBuckets)
    .set({ tokens: sql`least(${capacity}, ${refilled} + 1)`, updatedMs: laterMs })
    .where(eq(rateLimitBuckets.key, sql.placeholder('key')))
    .prepare('rate_limit_refund');
}

/**
 * Buckets in the rate_limit_buckets table, shared by every API instance on one database.
 * Each take is one INSERT ... ON CONFLICT DO UPDATE: Postgres locks the row, refills it from
 * the stored tokens and time, and spends a token only when one is there. Parallel takes on a
 * key queue on that row lock, so no two of them can spend the same token.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  private preparedSpend: ReturnType<typeof prepareSpend> | undefined;
  private preparedRefund: ReturnType<typeof prepareRefund> | undefined;

  constructor(private readonly db: DrizzleDb) {}

  async take(key: string, options: TakeOptions): Promise<TakeResult> {
    if (await this.spendToken(key, options)) {
      return { kind: 'allowed' };
    }
    return limitedResult(await this.currentTokens(key, options), options);
  }

  /** A missing row is a full bucket already, so a refund there writes nothing. */
  async refund(key: string, options: TakeOptions): Promise<void> {
    this.preparedRefund ??= prepareRefund(this.db);
    await this.preparedRefund.execute({
      key,
      nowMs: options.nowMs,
      capacity: options.capacity,
      refillPerMs: refillPerMs(options),
    });
  }

  /** True when the upsert spent a token; the WHERE skips the update when none is there. */
  private async spendToken(key: string, options: TakeOptions): Promise<boolean> {
    this.preparedSpend ??= prepareSpend(this.db);
    const spent = await this.preparedSpend.execute({
      key,
      nowMs: options.nowMs,
      capacity: options.capacity,
      firstTokens: options.capacity - 1,
      refillPerMs: refillPerMs(options),
    });
    return spent.length > 0;
  }

  /**
   * A limited take writes nothing, which leaves the same bucket as writing the refilled count:
   * below 1 token the bucket is under capacity, so no refill was cut off. This read only sets
   * the retry time; the decision was already made by the upsert.
   */
  private async currentTokens(key: string, options: TakeOptions): Promise<number> {
    const [stored] = await this.db
      .select({ tokens: rateLimitBuckets.tokens, updatedMs: rateLimitBuckets.updatedMs })
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.key, key));
    return refilledTokens(stored, options);
  }
}
