import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorBodySchema } from '../src/contracts/common.js';

import { GARDEN, createProject, submitDocument, submitGarden } from './fixtures.js';
import {
  KEVIN,
  BOB,
  MOLLY,
  SALLY,
  STAFF,
  errorKind,
  startHarness,
  type Harness,
} from './harness.js';

const VOTES_PER_MINUTE = 2;
const MINUTE_MS = 60_000;

let h: Harness;

beforeAll(async () => {
  h = await startHarness({
    RATE_LIMIT_VOTES_PER_MINUTE: String(VOTES_PER_MINUTE),
    RATE_LIMIT_SUBMISSIONS_PER_HOUR: '3',
  });
});

afterAll(async () => {
  await h.close();
});

describe('rate limits', () => {
  it('returns 429 with Retry-After once a person votes too fast, then recovers', async () => {
    const staff = await h.login(STAFF);
    const bob = await h.login(BOB);
    const molly = await h.login(MOLLY);
    const project = await createProject(h, staff);
    const design = await submitGarden(h, bob, project.id);
    const cast = () =>
      h.call('POST', '/votes', {
        cookie: molly,
        body: { designId: design.id, value: 1, reasons: [] },
      });
    for (let count = 0; count < VOTES_PER_MINUTE; count += 1) {
      expect((await cast()).status).toBe(200);
    }
    const limited = await cast();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('30');
    expect(errorBodySchema.parse(limited.body).error.retryAfterSeconds).toBe(30);
    h.clock.advance(MINUTE_MS);
    expect((await cast()).status).toBe(200);
  });

  it('answers 429 before looking at the design once a person votes too fast', async () => {
    const kevin = await h.login(KEVIN);
    const vote = { cookie: kevin, body: { designId: 'no-such-design', value: 1, reasons: [] } };
    const answers = [];
    for (let count = 0; count <= VOTES_PER_MINUTE; count += 1) {
      answers.push((await h.call('POST', '/votes', vote)).status);
    }
    expect(answers).toEqual([404, 404, 429]);
    h.clock.advance(MINUTE_MS);
  });

  it('limits submissions per person per hour', async () => {
    const staff = await h.login(STAFF);
    const kevin = await h.login(KEVIN);
    const project = await createProject(h, staff);
    for (let count = 0; count < 3; count += 1) {
      expect((await submitDocument(h, kevin, project.id, GARDEN)).status).toBe(200);
    }
    const response = await submitDocument(h, kevin, project.id, GARDEN);
    expect(response.status).toBe(429);
    expect(errorKind(response.body)).toBe('rate-limited');
  });
});

describe('rate limits on vote changes', () => {
  it('counts vote changes and withdraws against the same vote limit', async () => {
    const staff = await h.login(STAFF);
    const bob = await h.login(BOB);
    const sally = await h.login(SALLY);
    const project = await createProject(h, staff);
    const design = await submitGarden(h, bob, project.id);
    const path = `/designs/${design.id}/my-vote`;
    const change = () =>
      h.call('PUT', path, { cookie: sally, body: { value: -1, reasons: [], comment: null } });
    expect((await change()).status).toBe(200);
    expect((await h.call('DELETE', path, { cookie: sally })).status).toBe(200);
    const limitedChange = await change();
    const limitedWithdraw = await h.call('DELETE', path, { cookie: sally });
    expect([limitedChange.status, limitedWithdraw.status]).toEqual([429, 429]);
    expect(errorKind(limitedWithdraw.body)).toBe('rate-limited');
    h.clock.advance(MINUTE_MS);
    expect((await change()).status).toBe(200);
  });
});
