import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { projectListSchema, projectSchema } from '../src/contracts/projects-designs.js';

import { BLANK, createProject, projectBody } from './fixtures.js';
import { BOB, STAFF, errorKind, startHarness, type Harness } from './harness.js';

let h: Harness;
let staff: string;
let resident: string;

beforeAll(async () => {
  h = await startHarness();
  staff = await h.login(STAFF);
  resident = await h.login(BOB);
});

afterAll(async () => {
  await h.close();
});

describe('project routes', () => {
  it('lets staff create a project and anyone read it', async () => {
    const created = await h.call('POST', '/projects', { cookie: staff, body: projectBody() });
    expect(created.status).toBe(201);
    const project = projectSchema.parse(created.body);
    expect(project).toMatchObject({ status: 'open', baselineDesignId: null });
    const fetched = await h.call('GET', `/projects/${project.id}`);
    expect(projectSchema.parse(fetched.body)).toEqual(project);
    const listed = projectListSchema.parse((await h.call('GET', '/projects')).body);
    expect(listed.projects.map((entry) => entry.id)).toContain(project.id);
  });

  it('stores a baseline design when one is given', async () => {
    const project = await createProject(h, staff, { baselineDocument: BLANK });
    expect(project.baselineDesignId).not.toBeNull();
  });

  it('returns 401 without a session and 403 for residents', async () => {
    expect((await h.call('POST', '/projects', { body: projectBody() })).status).toBe(401);
    const denied = await h.call('POST', '/projects', { cookie: resident, body: projectBody() });
    expect(denied.status).toBe(403);
    expect(errorKind(denied.body)).toBe('forbidden');
  });

  it('rejects a project whose parameters do not parse', async () => {
    const body = projectBody({ parameters: { budget: 'lots' } });
    expect((await h.call('POST', '/projects', { cookie: staff, body })).status).toBe(400);
  });

  it('returns 404 for an unknown project', async () => {
    expect((await h.call('GET', '/projects/missing')).status).toBe(404);
  });

  it('lets staff close and reopen a project', async () => {
    const project = await createProject(h, staff);
    const path = `/projects/${project.id}/status`;
    const closed = await h.call('PATCH', path, { cookie: staff, body: { status: 'closed' } });
    expect(projectSchema.parse(closed.body).status).toBe('closed');
    const reopened = await h.call('PATCH', path, { cookie: staff, body: { status: 'open' } });
    expect(projectSchema.parse(reopened.body).status).toBe('open');
  });

  it('guards status changes by role, value and project', async () => {
    const project = await createProject(h, staff);
    const path = `/projects/${project.id}/status`;
    const body = { status: 'closed' };
    expect((await h.call('PATCH', path, { cookie: resident, body })).status).toBe(403);
    const badValue = { cookie: staff, body: { status: 'paused' } };
    expect((await h.call('PATCH', path, badValue)).status).toBe(400);
    const missing = await h.call('PATCH', '/projects/missing/status', { cookie: staff, body });
    expect(missing.status).toBe(404);
  });
});

describe('project names', () => {
  it('answers 409 projectExists to a second create of one name by one staff member', async () => {
    const body = projectBody({ name: 'Grandview Park' });
    expect((await h.call('POST', '/projects', { cookie: staff, body })).status).toBe(201);
    const again = { ...body, name: 'GRANDVIEW park' };
    const response = await h.call('POST', '/projects', { cookie: staff, body: again });
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('projectExists');
  });

  it('makes one project when a double-submitted create sends the same body twice', async () => {
    const body = projectBody({ name: 'Clark Park' });
    const send = () => h.call('POST', '/projects', { cookie: staff, body });
    const statuses = (await Promise.all([send(), send()])).map((response) => response.status);
    expect(statuses.sort()).toEqual([201, 409]);
    const listed = projectListSchema.parse((await h.call('GET', '/projects')).body);
    expect(listed.projects.filter((entry) => entry.name === 'Clark Park')).toHaveLength(1);
  });
});
