import { loadConfig } from '@parkshape/config';
import { FakeClock } from '@parkshape/core';

import { createApp, openApiDocument } from './app.js';
import { createInMemoryDeps } from './container.js';

const JSON_INDENT = 2;

/** Sorts object keys at every depth so the written spec only changes when the API does. */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries.map(([key, inner]) => [key, sortKeys(inner)]));
  }
  return value;
}

/** The OpenAPI document as written to apps/api/openapi.json. */
export function renderOpenApi(): string {
  // The document depends only on the routes, so throwaway in-memory deps are enough. The fixed
  // rules need no key, so pnpm openapi:gen prints no note about AI_API_KEY.
  const deps = createInMemoryDeps(loadConfig({ AI_PROVIDER: 'rule-based' }), {
    clock: new FakeClock(new Date(0)),
    authSecret: 'openapi-generator-only-secret-of-32-chars',
  });
  return `${JSON.stringify(sortKeys(openApiDocument(createApp(deps))), null, JSON_INDENT)}\n`;
}
