import { createSeededRandom, type Random } from '@parkshape/core';

// 32-bit FNV-1a, for turning a user id and call number into a seed.
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Hands out one seeded Random per queue request. */
export type QueueRandomSource = (userId: string) => Random;

function fnv1a(text: string, start: number): number {
  let hash = start >>> 0;
  for (const char of text) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), FNV_PRIME) >>> 0;
  }
  return hash;
}

/**
 * Seeds each request from the base seed, the user id and that user's request count, so the
 * same user gets a new batch on each call while a fixed base seed keeps tests deterministic.
 */
export function createQueueRandoms(baseSeed: number): QueueRandomSource {
  const requestCounts = new Map<string, number>();
  return (userId) => {
    const count = (requestCounts.get(userId) ?? 0) + 1;
    requestCounts.set(userId, count);
    const seed = fnv1a(`${userId}#${String(count)}`, FNV_OFFSET_BASIS ^ baseSeed);
    return createSeededRandom(seed);
  };
}
