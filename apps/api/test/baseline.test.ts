import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { designSchema } from '../src/contracts/projects-designs.js';

import { GARDEN, createDraft, createProject } from './fixtures.js';
import { MOLLY, STAFF, startHarness, type Harness } from './harness.js';

let h: Harness;
let staff: string;
let molly: string;

beforeAll(async () => {
  h = await startHarness();
  staff = await h.login(STAFF);
  molly = await h.login(MOLLY);
});

afterAll(async () => {
  await h.close();
});

async function projectWithBaseline() {
  const project = await createProject(h, staff, { baselineDocument: GARDEN });
  const { baselineDesignId } = project;
  if (baselineDesignId === null) throw new Error('the project has no baseline');
  return { project, baselineDesignId };
}

describe('reading the baseline design for Compare with today', () => {
  it('returns the baseline to a signed-in resident, without its author', async () => {
    const { project, baselineDesignId } = await projectWithBaseline();
    const response = await h.call('GET', `/designs/${baselineDesignId}`, { cookie: molly });
    expect(response.status).toBe(200);
    const design = designSchema.parse(response.body);
    expect(design).toMatchObject({ id: baselineDesignId, projectId: project.id, author: null });
    expect(design.document).toEqual(GARDEN);
  });

  it('hides the baseline from someone who is not signed in', async () => {
    const { baselineDesignId } = await projectWithBaseline();
    const response = await h.call('GET', `/designs/${baselineDesignId}`);
    expect(response.status).toBe(404);
  });

  it('keeps other staff drafts private', async () => {
    const { project } = await projectWithBaseline();
    const draft = await createDraft(h, staff, project.id);
    const response = await h.call('GET', `/designs/${draft.id}`, { cookie: molly });
    expect(response.status).toBe(404);
  });
});
