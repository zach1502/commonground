import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { designSchema, projectSchema } from '../src/contracts/projects-designs.js';

import { GARDEN, createProject, projectBody } from './fixtures.js';
import { BOB, STAFF, errorKind, startHarness, type Harness } from './harness.js';

const ZONE = {
  id: 'zone-1',
  kind: 'forbidden',
  label: 'Washroom service area',
  polygon: [
    { x: 50, y: 50 },
    { x: 60, y: 50 },
    { x: 60, y: 60 },
  ],
};

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

describe('publishing a project from the setup wizard', () => {
  it('adds the drawn zones to the forbidden zones in the parameters', async () => {
    const body = projectBody({ baselineDocument: GARDEN, zones: [ZONE] });
    const response = await h.call('POST', '/projects', { cookie: staff, body });
    expect(response.status).toBe(201);
    const project = projectSchema.parse(response.body);
    expect(project.parameters.forbiddenZones).toEqual([ZONE]);
  });

  it('rejects a zone with an unknown kind', async () => {
    const body = projectBody({ zones: [{ ...ZONE, kind: 'fenced' }] });
    expect((await h.call('POST', '/projects', { cookie: staff, body })).status).toBe(400);
  });

  it('rejects a baseline document that does not parse', async () => {
    const body = projectBody({ baselineDocument: { version: 2 } });
    expect((await h.call('POST', '/projects', { cookie: staff, body })).status).toBe(400);
  });
});

describe('GET /projects/:id/baseline', () => {
  it('returns the baseline design to anyone signed in', async () => {
    const project = await createProject(h, staff, { baselineDocument: GARDEN });
    const response = await h.call('GET', `/projects/${project.id}/baseline`, { cookie: resident });
    expect(response.status).toBe(200);
    const design = designSchema.parse(response.body);
    expect(design.id).toBe(project.baselineDesignId);
    expect(design.document).toEqual(GARDEN);
  });

  it('returns 404 when the project has no baseline', async () => {
    const project = await createProject(h, staff);
    const response = await h.call('GET', `/projects/${project.id}/baseline`, { cookie: staff });
    expect(response.status).toBe(404);
  });

  it('needs a session', async () => {
    const project = await createProject(h, staff, { baselineDocument: GARDEN });
    expect((await h.call('GET', `/projects/${project.id}/baseline`)).status).toBe(401);
  });
});

describe('PATCH /projects/:id/status phase guard', () => {
  it('refuses to close a project that is already closed', async () => {
    const project = await createProject(h, staff);
    const path = `/projects/${project.id}/status`;
    const body = { status: 'closed' };
    expect((await h.call('PATCH', path, { cookie: staff, body })).status).toBe(200);
    const again = await h.call('PATCH', path, { cookie: staff, body });
    expect(again.status).toBe(409);
    expect(errorKind(again.body)).toBe('wrong-status');
  });

  it('stops votes on a closed project and allows them again after reopening', async () => {
    const project = await createProject(h, staff);
    const path = `/projects/${project.id}/status`;
    await h.call('PATCH', path, { cookie: staff, body: { status: 'closed' } });
    const refused = await h.call('POST', `/projects/${project.id}/designs`, {
      cookie: resident,
      body: { from: 'blank' },
    });
    expect(refused.status).toBe(409);
    await h.call('PATCH', path, { cookie: staff, body: { status: 'open' } });
    const allowed = await h.call('POST', `/projects/${project.id}/designs`, {
      cookie: resident,
      body: { from: 'blank' },
    });
    expect(allowed.status).toBe(201);
  });
});
