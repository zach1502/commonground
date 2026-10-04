/** Seeds for Describe it drafts that did not give one: the base seed plus a count, in 32 bits. */
export function createSeedCounter(baseSeed: number): () => number {
  let count = 0;
  return () => {
    count += 1;
    return (baseSeed + count) >>> 0;
  };
}
