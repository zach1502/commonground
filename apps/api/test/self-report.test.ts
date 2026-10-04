import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { meSchema, selfReportSchema } from '../src/contracts/participation.js';

import { BOB, MOLLY, errorKind, startHarness, type Harness } from './harness.js';

let h: Harness;
let bob: string;

beforeAll(async () => {
  h = await startHarness();
  bob = await h.login(BOB);
});

afterAll(async () => {
  await h.close();
});

const patch = (body: unknown, cookie?: string) =>
  h.call('PATCH', '/me/self-report', cookie === undefined ? { body } : { body, cookie });

describe('PATCH /me/self-report', () => {
  it('stores the FSA in upper case and the age band on the signed-in user', async () => {
    const response = await patch({ fsa: 'v5t', ageBand: '30-44' }, bob);
    expect(response.status).toBe(200);
    expect(selfReportSchema.parse(response.body)).toEqual({ fsa: 'V5T', ageBand: '30-44' });
    const user = await h.deps.repos.users.findById(BOB);
    expect(user?.selfReport).toEqual({ fsa: 'V5T', ageBand: '30-44' });
  });

  it('accepts null answers', async () => {
    const response = await patch({ fsa: null, ageBand: null }, bob);
    expect(response.status).toBe(200);
    expect((await h.deps.repos.users.findById(BOB))?.selfReport).toEqual({
      fsa: null,
      ageBand: null,
    });
  });

  it('rejects an FSA that is not letter, digit, letter and an unknown age band', async () => {
    for (const body of [
      { fsa: 'D5T', ageBand: null },
      { fsa: 'V5', ageBand: null },
      { fsa: null, ageBand: 'teen' },
    ]) {
      const response = await patch(body, bob);
      expect(response.status).toBe(400);
      expect(errorKind(response.body)).toBe('validation');
    }
  });

  it('needs a session', async () => {
    const response = await patch({ fsa: 'V5T', ageBand: null });
    expect(response.status).toBe(401);
  });
});

describe('GET /me and the self report', () => {
  it('returns null before the user answers', async () => {
    const molly = await h.login(MOLLY);
    const response = await h.call('GET', '/me', { cookie: molly });
    expect(response.status).toBe(200);
    expect(meSchema.parse(response.body).selfReport).toBeNull();
  });

  it('returns the saved answers', async () => {
    await patch({ fsa: 'v6a', ageBand: '65-plus' }, bob);
    const response = await h.call('GET', '/me', { cookie: bob });
    expect(meSchema.parse(response.body).selfReport).toEqual({ fsa: 'V6A', ageBand: '65-plus' });
  });
});
