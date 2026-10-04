import { vi } from 'vitest';

import { makeFlatHeightmap } from '@parkshape/core';

import type { WebApi } from '../api/web-api';
import type { WebDeps } from '../app-deps';
import { createLoaders } from '../routing/loaders';
import { createMemorySelfReportStore } from '../session/self-report';

import { createTestDeps, PERSONAS, RESIDENT } from './api-server';

// Fakes shared by the route loader tests.
const DEADLINE_FIELDS = { phase: 'open', closesAt: '2026-10-31' } as const;
const PROJECT_FIELDS = { ...DEADLINE_FIELDS, baselineDesignId: null } as const;
export const PROJECT = {
  id: 'jrp',
  name: 'Jonathan Rogers Park',
  status: 'open',
  ...PROJECT_FIELDS,
};
export const QUEUE = { project: PROJECT, designs: [], baselineDesignId: null, poster: null };
const DESIGN_COUNT = 4;
export const TERRAIN = makeFlatHeightmap({ width: 2, height: 2, elevationM: 7 });

export function fakeApi(overrides: Partial<WebApi> = {}): WebApi {
  return {
    getMe: vi.fn().mockResolvedValue(null),
    listPersonas: vi.fn().mockResolvedValue({ personas: PERSONAS, staffCodeRequired: true }),
    login: vi.fn(),
    logout: vi.fn(),
    listProjects: vi.fn().mockResolvedValue([PROJECT]),
    getProject: vi.fn().mockResolvedValue(PROJECT),
    getTerrain: vi.fn().mockResolvedValue(TERRAIN),
    getContext: vi.fn().mockRejectedValue(new Error('off')),
    countDesigns: vi.fn().mockResolvedValue(DESIGN_COUNT),
    listDesigns: vi.fn().mockResolvedValue([]),
    saveSelfReport: vi.fn(),
    createDesign: vi.fn(),
    describeDesign: vi.fn(),
    getDesign: vi.fn(),
    getInsights: vi.fn(),
    getSummary: vi.fn().mockRejectedValue(new Error('off')),
    saveDraft: vi.fn(),
    submitDesign: vi.fn(),
    saveThumbnail: vi.fn(),
    makeVersion: vi.fn(),
    getQueue: vi.fn().mockResolvedValue(QUEUE),
    castVote: vi.fn(),
    getLeaderboard: vi.fn(),
    getMyVote: vi.fn(),
    setMyVote: vi.fn(),
    withdrawMyVote: vi.fn(),
    loadSiteFeatures: vi.fn(),
    loadTerrain: vi.fn(),
    createProject: vi.fn(),
    setProjectStatus: vi.fn(),
    ...overrides,
  };
}

export function loadersWith(api: WebApi) {
  const deps: WebDeps = { ...createTestDeps(), api, selfReports: createMemorySelfReportStore() };
  return createLoaders(deps);
}

export const args = (params: Record<string, string> = {}, path = '/') => ({
  request: new Request(`http://web.test${path}`),
  params,
  context: undefined,
});

export function loaded<T>(result: T | Response): T {
  if (result instanceof Response) {
    throw new Error(`unexpected redirect to ${String(result.headers.get('Location'))}`);
  }
  return result;
}

export const DESIGN = { id: 'd1', projectId: 'jrp' };
export const signedIn = (overrides: Partial<WebApi> = {}) =>
  loadersWith(fakeApi({ getMe: vi.fn().mockResolvedValue(RESIDENT), ...overrides }));
