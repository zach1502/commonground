import { describe, expect, it } from 'vitest';

import { cacheKey, stableStringify } from './cache-key.js';

describe('stableStringify', () => {
  it('writes object keys in sorted order at every depth', () => {
    expect(stableStringify({ b: [{ d: 1, c: 2 }], a: 'x' })).toBe('{"a":"x","b":[{"c":2,"d":1}]}');
  });

  it('skips undefined fields like JSON.stringify does', () => {
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});

describe('cacheKey', () => {
  it('gives the same key for the same input in any key order', () => {
    expect(cacheKey('summary', { a: 1, b: 2 })).toBe(cacheKey('summary', { b: 2, a: 1 }));
  });

  it('gives different keys for different inputs and namespaces', () => {
    expect(cacheKey('summary', { a: 1 })).not.toBe(cacheKey('summary', { a: 2 }));
    expect(cacheKey('summary', 'x')).not.toBe(cacheKey('intent', 'x'));
  });

  it('starts with the namespace and a version', () => {
    expect(cacheKey('intent', 'a pond')).toMatch(/^intent:v1:[0-9a-f]{14}$/);
  });
});
