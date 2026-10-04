import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DesignDocumentInput } from '@parkshape/core';

import { designSchema, submitResultSchema } from '../src/contracts/projects-designs.js';
import { siteFeaturesResultSchema } from '../src/contracts/site.js';

import { GARDEN, createProject } from './fixtures.js';
import { BOB, STAFF, startHarness, type Harness } from './harness.js';

let h: Harness;
let staff: string;
let bob: string;

beforeAll(async () => {
  h = await startHarness({ RATE_LIMIT_SUBMISSIONS_PER_HOUR: '100' });
  staff = await h.login(STAFF);
  bob = await h.login(BOB);
});

afterAll(async () => {
  await h.close();
});

const RECORDED_PLOTS = 56;
// GARDEN is 12 m by 16 m from (10, 10), which fits 24 beds.
const FITTED_PLOTS = 24;
const SHIFT_M = 2;

const [garden] = GARDEN.areas;
if (garden === undefined) throw new Error('GARDEN has a garden');
const RECORDED: DesignDocumentInput = {
  ...GARDEN,
  areas: [{ ...garden, existing: true, recordedPlots: RECORDED_PLOTS }],
};
const MOVED: DesignDocumentInput = {
  ...RECORDED,
  areas: [
    {
      ...garden,
      polygon: [
        { x: 10 + SHIFT_M, y: 10 },
        { x: 22 + SHIFT_M, y: 10 },
        { x: 22 + SHIFT_M, y: 26 },
        { x: 10 + SHIFT_M, y: 26 },
      ],
    },
  ],
};

async function draftFromBaseline(projectId: string) {
  const response = await h.call('POST', `/projects/${projectId}/designs`, {
    cookie: bob,
    body: { from: 'baseline', title: 'The park today' },
  });
  return designSchema.parse(response.body);
}

async function submittedPlots(designId: string, document?: DesignDocumentInput) {
  if (document !== undefined) {
    await h.call('PUT', `/designs/${designId}`, {
      cookie: bob,
      body: { title: 'The park today', blurb: 'Garden beds.', document },
    });
  }
  const response = await h.call('POST', `/designs/${designId}/submit`, { cookie: bob });
  return submitResultSchema.parse(response.body).metrics.totals.gardenPlots;
}

describe('recorded plots of an existing garden', () => {
  it('reports the 56 recorded plots for the baseline garden kept as it is', async () => {
    const project = await createProject(h, staff, { baselineDocument: RECORDED });
    const draft = await draftFromBaseline(project.id);
    expect(await submittedPlots(draft.id)).toBe(RECORDED_PLOTS);
  });

  it('fits beds again once the resident moves the garden', async () => {
    const project = await createProject(h, staff, { baselineDocument: RECORDED });
    const draft = await draftFromBaseline(project.id);
    expect(await submittedPlots(draft.id, MOVED)).toBe(FITTED_PLOTS);
  });

  it('gives the garden outline from the site data the 56 plots of its record', async () => {
    const response = await h.call('POST', '/site-features', {
      cookie: staff,
      body: { parkName: 'Jonathan Rogers Park' },
    });
    const result = siteFeaturesResultSchema.parse(response.body);
    const outlines = result.features.filter(
      (feature) => feature.kind === 'garden' && feature.polygon !== null,
    );
    expect(outlines.map((feature) => feature.plots)).toEqual([RECORDED_PLOTS]);
  });
});
