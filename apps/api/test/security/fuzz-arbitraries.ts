import fc from 'fast-check';

/** Keys that reach Object.prototype when code merges parsed JSON without care. */
const POISON_KEYS = ['__proto__', 'constructor', 'prototype'] as const;
const HUGE_STRING_LENGTH = 200_000;
const HUGE_ARRAY_LENGTH = 100_000;
const DEEP_NESTING = 5_000;
const MAX_GARBAGE_ID_LENGTH = 5_000;

/** A JSON body as sent on the wire; raw text lets a probe send what JSON.stringify cannot. */
export type FuzzBody =
  | { readonly kind: 'json'; readonly value: unknown }
  | { readonly kind: 'raw'; readonly text: string };

const deepArray = (depth: number) => `${'['.repeat(depth)}${']'.repeat(depth)}`;

/** Values that break types, ranges and sizes: what a hostile or broken client sends. */
export const poisonValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer({ min: -1_000_000_000, max: -1 }),
  fc.double(),
  fc.constant(''),
  fc.constant('x'.repeat(HUGE_STRING_LENGTH)),
  fc.string({ unit: 'binary', maxLength: 64 }),
  fc.string({ maxLength: 16 }).map((text) => `\u0000${text}\u0000`),
  fc.constant(new Array<number>(HUGE_ARRAY_LENGTH).fill(0)),
  fc.constant({}),
  fc.constant([]),
  fc.jsonValue({ maxDepth: 4 }),
);

function withOwnKey(target: Record<string, unknown>, key: string, value: unknown) {
  const copy = { ...target };
  Object.defineProperty(copy, key, { value, enumerable: true, configurable: true, writable: true });
  return copy;
}

/** Every path to a value inside the seed body, so a mutation can land at any depth. */
function pathsOf(value: unknown, prefix: readonly (string | number)[] = []): (string | number)[][] {
  if (typeof value !== 'object' || value === null) return [[...prefix]];
  const entries = Array.isArray(value)
    ? value.map((item, index) => [index, item] as const)
    : Object.entries(value as Record<string, unknown>);
  return [[...prefix], ...entries.flatMap(([key, item]) => pathsOf(item, [...prefix, key]))];
}

function replaceAt(value: unknown, path: readonly (string | number)[], next: unknown): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return next;
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.map((item, index) => (index === head ? replaceAt(item, rest, next) : item));
  }
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return withOwnKey(record, String(head), replaceAt(record[String(head)], rest, next));
}

function withoutKey(body: Record<string, unknown>, key: string) {
  return Object.fromEntries(Object.entries(body).filter(([name]) => name !== key));
}

const RAW_BODIES = [
  '',
  '{',
  'NaN',
  'Infinity',
  '{"a":1e999}',
  'null',
  '[]',
  '"text"',
  deepArray(DEEP_NESTING),
];

/**
 * Bodies built from the route's seed body and the property names the spec lists for it: one key
 * replaced, dropped or joined by a prototype key, a nested value replaced, or the whole body
 * swapped for garbage.
 */
export function mutatedBody(
  seed: Record<string, unknown>,
  keys: readonly string[],
): fc.Arbitrary<FuzzBody> {
  const specKeys = keys.length > 0 ? keys : Object.keys(seed);
  const json = (value: unknown): FuzzBody => ({ kind: 'json', value });
  return fc.oneof(
    fc
      .tuple(fc.constantFrom(...specKeys), poisonValue)
      .map(([key, value]) => json(withOwnKey(seed, key, value))),
    fc.constantFrom(...specKeys).map((key) => json(withoutKey(seed, key))),
    fc
      .tuple(fc.constantFrom(...POISON_KEYS), poisonValue)
      .map(([key, value]) => json(withOwnKey(seed, key, value))),
    fc
      .tuple(fc.constantFrom(...pathsOf(seed)), poisonValue)
      .map(([path, value]) => json(replaceAt(seed, path, value))),
    poisonValue.map(json),
    fc.constantFrom(...RAW_BODIES).map((text): FuzzBody => ({ kind: 'raw', text })),
  );
}

/** Percent-encodes what it can; a lone surrogate cannot be encoded, so it is sent as a marker. */
function safeEncode(text: string): string {
  try {
    return encodeURIComponent(text);
  } catch {
    return '%ED%A0%80';
  }
}

const TRICKY_IDS = [
  '..',
  '../..',
  '%',
  '%zz',
  '%E0%A4%A',
  "' OR 1=1 --",
  '__proto__',
  'constructor',
  '\u0000',
];

/** Path ids a client should never send: unicode, broken escapes, traversal and very long ones. */
export const garbageId: fc.Arbitrary<string> = fc.oneof(
  fc.string({ unit: 'binary', minLength: 1, maxLength: 64 }).map(safeEncode),
  fc.constantFrom(...TRICKY_IDS),
  fc.integer({ min: 1, max: MAX_GARBAGE_ID_LENGTH }).map((length) => 'a'.repeat(length)),
  fc.string({ minLength: 1, maxLength: 16 }).map((text) => `${safeEncode(text)}%00`),
);
