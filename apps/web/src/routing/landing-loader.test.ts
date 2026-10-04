import { describe, expect, it, vi } from 'vitest';

import type { WebApi } from '../api/web-api';
import type { WebDeps } from '../app-deps';
import { createMemorySelfReportStore } from '../session/self-report';
import { createTestDeps } from '../test/api-server';

import { createLoaders } from './loaders';
import { PATHS } from './paths';

// The landing loader reads only the project list and each project's designs.
const DEADLINE_FIELDS = { phase: 'open', closesAt: '2026-10-31' } as const;
const PROJECT = { id: 'jrp', name: 'Jonathan Rogers Park', status: 'open', ...DEADLINE_FIELDS };
const OPEN_LINKS = { voteHref: PATHS.vote('jrp'), galleryHref: PATHS.gallery('jrp') };

function fakeApi(overrides: Partial<WebApi> = {}): WebApi {
  return {
    ...createTestDeps().api,
    listProjects: vi.fn().mockResolvedValue([PROJECT]),
    listDesigns: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function loadersWith(api: WebApi) {
  const deps: WebDeps = { ...createTestDeps(), api, selfReports: createMemorySelfReportStore() };
  return createLoaders(deps);
}

describe('landing loader', () => {
  it('links voting to the first open project and counts its designs and votes', async () => {
    const designs = [
      { up: 3, down: 1 },
      { up: 2, down: 0 },
    ];
    const api = fakeApi({ listDesigns: vi.fn().mockResolvedValue(designs) });
    expect(await loadersWith(api).landing()).toEqual({
      ...OPEN_LINKS,
      stats: { designs: 2, votes: 6 },
      deadline: DEADLINE_FIELDS,
    });
  });

  it('falls back to the project list when none is open', async () => {
    const api = fakeApi({ listProjects: vi.fn().mockResolvedValue([]) });
    const none = { voteHref: PATHS.projects, galleryHref: null, stats: null, deadline: null };
    expect(await loadersWith(api).landing()).toEqual(none);
  });

  it('reads the deadline from a project past its closing day, and links to the list', async () => {
    const past = { ...PROJECT, phase: 'closed' } as const;
    const api = fakeApi({ listProjects: vi.fn().mockResolvedValue([past]) });
    const deadline = { phase: 'closed', closesAt: '2026-10-31' };
    expect(await loadersWith(api).landing()).toMatchObject({ voteHref: PATHS.projects, deadline });
  });

  it('still opens when the counts do not load', async () => {
    const api = fakeApi({ listDesigns: vi.fn().mockRejectedValue(new Error('down')) });
    expect(await loadersWith(api).landing()).toEqual({
      ...OPEN_LINKS,
      stats: null,
      deadline: DEADLINE_FIELDS,
    });
  });
});
