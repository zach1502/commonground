import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { projectSchema } from '../src/contracts/projects-designs.js';

import { BLANK, createDraft, createProject, projectBody, submitGarden } from './fixtures.js';
import { BOB, MOLLY, STAFF, errorKind, startHarness, type Harness } from './harness.js';

const CLOSES_AT = '2026-10-31';
const LAST_SECOND_MS = Date.parse('2026-11-01T06:59:59.000Z');
const ONE_SECOND_MS = 1000;

let h: Harness;
let staff: string;
let author: string;
let voter: string;

beforeAll(async () => {
  h = await startHarness();
  staff = await h.login(STAFF);
  author = await h.login(BOB);
  voter = await h.login(MOLLY);
});

afterAll(async () => {
  await h.close();
});

async function phaseOf(id: string) {
  return projectSchema.parse((await h.call('GET', `/projects/${id}`)).body);
}

describe('a project closing date', () => {
  it('is stored at create and reported with an open phase before that day', async () => {
    const project = await createProject(h, staff, { closesAt: CLOSES_AT });
    expect(project).toMatchObject({ status: 'open', closesAt: CLOSES_AT, phase: 'open' });
    expect(await phaseOf(project.id)).toMatchObject({ closesAt: CLOSES_AT, phase: 'open' });
  });

  it('is optional, and a project without one reports null', async () => {
    const project = await createProject(h, staff);
    expect(project).toMatchObject({ closesAt: null, phase: 'open' });
  });

  it('must be an ISO calendar date', async () => {
    const body = projectBody({ closesAt: '31 October 2026' });
    const response = await h.call('POST', '/projects', { cookie: staff, body });
    expect(response.status).toBe(400);
    expect(errorKind(response.body)).toBe('validation');
  });

  it('reports closed when staff close the project, whatever the date', async () => {
    const project = await createProject(h, staff, { closesAt: CLOSES_AT });
    const path = `/projects/${project.id}/status`;
    const closed = await h.call('PATCH', path, { cookie: staff, body: { status: 'closed' } });
    expect(projectSchema.parse(closed.body)).toMatchObject({ status: 'closed', phase: 'closed' });
  });
});

/** A dated project with a live design and a draft, with the clock on its last open second. */
async function projectAtItsLastSecond() {
  const project = await createProject(h, staff, { closesAt: CLOSES_AT });
  const liveDesignId = (await submitGarden(h, author, project.id)).id;
  const draftId = (await createDraft(h, author, project.id)).id;
  h.clock.advance(LAST_SECOND_MS - h.clock.now().getTime());
  // Sessions last 7 days, so everyone signs in again after the jump.
  staff = await h.login(STAFF);
  author = await h.login(BOB);
  voter = await h.login(MOLLY);
  return { projectId: project.id, liveDesignId, draftId };
}

describe('after the closing date passes', () => {
  let projectId = '';
  let liveDesignId = '';
  let draftId = '';

  beforeAll(async () => {
    ({ projectId, liveDesignId, draftId } = await projectAtItsLastSecond());
  });

  it('still takes votes in the last second of the closing day', async () => {
    const body = { designId: liveDesignId, value: 1, reasons: [] };
    expect((await h.call('POST', '/votes', { cookie: voter, body })).status).toBe(200);
    expect((await phaseOf(projectId)).phase).toBe('open');
  });

  it('reports the phase as closed while the status stays open', async () => {
    h.clock.advance(ONE_SECOND_MS);
    expect(await phaseOf(projectId)).toMatchObject({ status: 'open', phase: 'closed' });
  });

  it('refuses votes, submits, saves and new drafts as a closed phase', async () => {
    const vote = await h.call('POST', '/votes', {
      cookie: voter,
      body: { designId: liveDesignId, value: -1, reasons: [] },
    });
    expect(errorKind(vote.body)).toBe('phase-closed');
    const submit = await h.call('POST', `/designs/${draftId}/submit`, { cookie: author });
    expect(errorKind(submit.body)).toBe('phase-closed');
    const save = await h.call('PUT', `/designs/${draftId}`, {
      cookie: author,
      body: { title: 'Late edit', blurb: '', document: BLANK },
    });
    expect(save.status).toBe(409);
    expect(errorKind(save.body)).toBe('phase-closed');
    const draft = await h.call('POST', `/projects/${projectId}/designs`, {
      cookie: author,
      body: { from: 'blank' },
    });
    expect(errorKind(draft.body)).toBe('phase-closed');
  });

  it('opens again when staff move the date through the status route', async () => {
    const path = `/projects/${projectId}/status`;
    const body = { status: 'open', closesAt: '2026-11-30' };
    const moved = await h.call('PATCH', path, { cookie: staff, body });
    expect(moved.status).toBe(200);
    expect(projectSchema.parse(moved.body)).toMatchObject({
      status: 'open',
      closesAt: '2026-11-30',
      phase: 'open',
    });
  });

  it('keeps refusing a status change that changes nothing', async () => {
    const path = `/projects/${projectId}/status`;
    const again = await h.call('PATCH', path, { cookie: staff, body: { status: 'open' } });
    expect(errorKind(again.body)).toBe('wrong-status');
  });
});
