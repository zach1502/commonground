import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorBodySchema } from '../../src/contracts/common.js';
import { BLANK, GARDEN } from '../fixtures.js';

import { startWorld, type World } from './world.js';

let world: World;

beforeAll(async () => {
  world = await startWorld();
});

afterAll(async () => {
  await world.h.close();
});

const save = (rawBody: string) =>
  world.call('PUT', `/designs/${world.draftId}`, {
    cookie: world.cookies.residentA ?? '',
    rawBody,
  });

describe('request text the database cannot store', () => {
  it('answers 400 validation for a body that is not JSON', async () => {
    const response = await save('{"title":');
    expect(response.status).toBe(400);
    expect(errorBodySchema.parse(response.body).error.kind).toBe('validation');
  });

  it('answers 400 for a null character in a stored string', async () => {
    const body = { title: 'Lane\u0000', blurb: '', document: BLANK };
    const response = await save(JSON.stringify(body));
    expect(response.status).toBe(400);
  });

  it('answers 400 for a lone surrogate inside the design document', async () => {
    const text = JSON.stringify({ title: 'Lane', blurb: '', document: GARDEN }).replace(
      '"garden-1"',
      '"\\ud800"',
    );
    expect((await save(text)).status).toBe(400);
  });

  it('keeps an escaped backslash before u0000 as ordinary text', async () => {
    const body = { title: 'C:\\u0000', blurb: '', document: BLANK };
    expect((await save(JSON.stringify(body))).status).toBe(200);
  });

  it('answers 400 for a null character in a path id', async () => {
    const response = await world.call('GET', '/designs/abc%00def');
    expect(response.status).toBe(400);
  });

  it('answers 404 for a null character in a thumbnail key', async () => {
    const response = await world.call('GET', '/blobs/thumbnails/abc%00def.png');
    expect(response.status).toBe(404);
    expect(errorBodySchema.parse(response.body).error.kind).toBe('not-found');
  });
});

describe('bodies the JSON reader refuses', () => {
  it('answers 400 validation for an empty JSON body', async () => {
    const response = await save('');
    expect(response.status).toBe(400);
    expect(errorBodySchema.parse(response.body).error.kind).toBe('validation');
  });

  it('answers 4xx for a body sent as plain text', async () => {
    const response = await world.h.app.request('/votes', {
      method: 'POST',
      headers: { Cookie: world.cookies.residentB ?? '', 'Content-Type': 'text/plain' },
      body: 'designId=1',
    });
    expect(response.status).toBe(400);
  });
});
