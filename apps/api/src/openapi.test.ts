import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { renderOpenApi, sortKeys } from './openapi.js';

const SPEC_FILE = new URL('../openapi.json', import.meta.url);

describe('renderOpenApi', () => {
  it('matches the committed openapi.json; run pnpm openapi:gen when it does not', () => {
    expect(readFileSync(SPEC_FILE, 'utf8')).toBe(renderOpenApi());
  });

  it('writes no note about AI_API_KEY, since the spec does not depend on the model', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      renderOpenApi();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('sorts keys at every depth and keeps array order', () => {
    expect(JSON.stringify(sortKeys({ b: [{ d: 1, c: 2 }], a: null }))).toBe(
      '{"a":null,"b":[{"c":2,"d":1}]}',
    );
  });
});
