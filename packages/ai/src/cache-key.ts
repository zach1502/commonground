// cyrb53: a fast 53-bit string hash. Enough to key a small cache; not for security.
const SEED_A = 0xdeadbeef;
const SEED_B = 0x41c6ce57;
const MIX_A = 2_654_435_761;
const MIX_B = 1_597_334_677;
const MIX_C = 2_246_822_507;
const MIX_D = 3_266_489_909;
const SHIFT_16 = 16;
const SHIFT_13 = 13;
const HIGH_BITS = 2_097_151;
const HIGH_SCALE = 4_294_967_296;
const HEX = 16;
const HASH_HEX_CHARS = 14;
const KEY_VERSION = 'v1';

function cyrb53(text: string): number {
  let h1 = SEED_A;
  let h2 = SEED_B;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, MIX_A);
    h2 = Math.imul(h2 ^ code, MIX_B);
  }
  h1 = Math.imul(h1 ^ (h1 >>> SHIFT_16), MIX_C) ^ Math.imul(h2 ^ (h2 >>> SHIFT_13), MIX_D);
  h2 = Math.imul(h2 ^ (h2 >>> SHIFT_16), MIX_C) ^ Math.imul(h1 ^ (h1 >>> SHIFT_13), MIX_D);
  return HIGH_SCALE * (HIGH_BITS & h2) + (h1 >>> 0);
}

/** JSON with object keys sorted at every depth, so equal inputs give equal text. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (typeof inner !== 'object' || inner === null || Array.isArray(inner)) {
      return inner;
    }
    const entries = Object.entries(inner).sort(([left], [right]) => (left < right ? -1 : 1));
    return Object.fromEntries(entries);
  });
}

/** A cache key for a provider input: namespace, key version and a hash of the input. */
export function cacheKey(namespace: string, input: unknown): string {
  const hash = cyrb53(stableStringify(input)).toString(HEX).padStart(HASH_HEX_CHARS, '0');
  return `${namespace}:${KEY_VERSION}:${hash}`;
}
