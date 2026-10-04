import { describe, expect, it } from 'vitest';

import { loadConfig } from '@parkshape/config';
import { DatabaseUnavailableError } from '@parkshape/db';

import { createApp } from '../../src/app.js';
import { createInMemoryDeps } from '../../src/container.js';
import type { AppDeps } from '../../src/deps.js';

const SECRET = 'recovery-test-secret-of-32-characters';
const UNAVAILABLE = 503;
const INTERNAL = 500;

/** In-memory deps whose project list fails the way a guarded driver does. */
function depsFailingWith(error: Error): AppDeps {
  const deps = createInMemoryDeps(loadConfig({ AUTH_SECRET: SECRET }));
  const inner = deps.repos.projects;
  const projects: AppDeps['repos']['projects'] = {
    create: (input) => inner.create(input),
    findById: (id) => inner.findById(id),
    list: () => Promise.reject(error),
    setStatus: (id, status) => inner.setStatus(id, status),
    setClosesAt: (id, closesAt) => inner.setClosesAt(id, closesAt),
    changeStatus: (id, change) => inner.changeStatus(id, change),
    setBaselineDesign: (id, designId) => inner.setBaselineDesign(id, designId),
  };
  return { ...deps, repos: { ...deps.repos, projects } };
}

async function listProjects(deps: AppDeps) {
  const response = await createApp(deps).request('/projects');
  return {
    status: response.status,
    retryAfter: response.headers.get('Retry-After'),
    body: (await response.json()) as { error: { kind: string; message: string } },
  };
}

describe('a request whose database call fails', () => {
  it.each(['connection-lost', 'timed-out', 'not-connected'] as const)(
    'answers 503 databaseUnavailable with a retry hint when the reason is %s',
    async (reason) => {
      const result = await listProjects(depsFailingWith(new DatabaseUnavailableError(reason)));
      expect(result.status).toBe(UNAVAILABLE);
      expect(result.retryAfter).toMatch(/^\d+$/);
      expect(result.body.error.kind).toBe('databaseUnavailable');
      expect(result.body.error.message).not.toMatch(/connection-lost|timed-out|not-connected/);
    },
  );

  it('still answers 500 for an error that is not about the connection', async () => {
    const result = await listProjects(depsFailingWith(new Error('column "x" does not exist')));
    expect(result.status).toBe(INTERNAL);
  });
});
