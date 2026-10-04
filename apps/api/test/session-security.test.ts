import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BLANK, createDraft, createProject, submitGarden } from './fixtures.js';
import { BOB, MOLLY, STAFF, errorKind, startHarness, type Harness } from './harness.js';

const HOSTED_ORIGIN = 'https://parkshape.example.ca';
// A hosted origin needs the staff access code; residents send it too and it is ignored.
const ACCESS_CODE = 'session-security-code';
const LOGINS_PER_MINUTE = 2;
const SAVES_PER_MINUTE = 2;
const INTENTS_PER_MINUTE = 1;
const THUMBNAILS_PER_HOUR = 1;
const ONE_MB = 1024 * 1024;
// A tiny valid PNG signature plus padding; the route sniffs the magic bytes.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let h: Harness;

beforeAll(async () => {
  h = await startHarness({
    CORS_ORIGIN: HOSTED_ORIGIN,
    STAFF_ACCESS_CODE: ACCESS_CODE,
    // The hosted API sits behind Vercel's proxy, which sets X-Forwarded-For.
    TRUST_PROXY: 'true',
    RATE_LIMIT_LOGINS_PER_MINUTE: String(LOGINS_PER_MINUTE),
    RATE_LIMIT_DRAFT_SAVES_PER_MINUTE: String(SAVES_PER_MINUTE),
    RATE_LIMIT_INTENTS_PER_MINUTE: String(INTENTS_PER_MINUTE),
    RATE_LIMIT_THUMBNAILS_PER_HOUR: String(THUMBNAILS_PER_HOUR),
  });
});

afterAll(async () => {
  await h.close();
});

const loginFrom = (address: string, persona = BOB) =>
  h.call('POST', '/auth/login', {
    body: { persona, accessCode: ACCESS_CODE },
    headers: { 'X-Forwarded-For': `${address}, 10.0.0.1` },
  });

describe('session cookie on a hosted origin', () => {
  it('marks the cookie Secure when the web origin is not localhost', async () => {
    const response = await loginFrom('203.0.113.1');
    expect(response.headers.get('Set-Cookie')).toMatch(/; Secure(;|$)/);
  });
});

describe('request limits', () => {
  it('returns 429 once one address signs in too often, and leaves other addresses alone', async () => {
    for (let count = 0; count < LOGINS_PER_MINUTE; count += 1) {
      expect((await loginFrom('198.51.100.7')).status).toBe(200);
    }
    const limited = await loginFrom('198.51.100.7');
    expect(limited.status).toBe(429);
    expect(errorKind(limited.body)).toBe('rate-limited');
    expect(limited.headers.get('Retry-After')).not.toBeNull();
    expect((await loginFrom('198.51.100.8')).status).toBe(200);
  });

  it('returns 413 for a JSON body over 1 MB', async () => {
    const response = await h.call('POST', '/auth/login', {
      body: { persona: 'x'.repeat(ONE_MB) },
    });
    expect(response.status).toBe(413);
    expect(errorKind(response.body)).toBe('payload-too-large');
  });

  it('limits draft saves per person', async () => {
    const staff = (await loginFrom('192.0.2.10', STAFF)).headers.get('Set-Cookie') ?? '';
    const molly = (await loginFrom('192.0.2.11', MOLLY)).headers.get('Set-Cookie') ?? '';
    const project = await createProject(h, staff.split(';')[0] ?? '');
    const cookie = molly.split(';')[0] ?? '';
    const draft = await createDraft(h, cookie, project.id);
    const body = { title: 'Lane', blurb: '', document: BLANK };
    const save = () => h.call('PUT', `/designs/${draft.id}`, { cookie, body });
    for (let count = 0; count < SAVES_PER_MINUTE; count += 1) {
      expect((await save()).status).toBe(200);
    }
    expect((await save()).status).toBe(429);
  });

  it('limits Describe it requests and thumbnail uploads per person', async () => {
    const staff = (await loginFrom('192.0.2.20', STAFF)).headers.get('Set-Cookie') ?? '';
    const bob = (await loginFrom('192.0.2.21')).headers.get('Set-Cookie') ?? '';
    const cookie = bob.split(';')[0] ?? '';
    const project = await createProject(h, staff.split(';')[0] ?? '');
    const describe = () =>
      h.call('POST', `/projects/${project.id}/intent`, { cookie, body: { text: 'A loop path' } });
    expect((await describe()).status).toBe(200);
    expect((await describe()).status).toBe(429);
    const design = await submitGarden(h, cookie, project.id);
    const upload = () =>
      h.call('POST', `/designs/${design.id}/thumbnail`, {
        cookie,
        body: { image: PNG.toString('base64') },
      });
    expect((await upload()).status).not.toBe(429);
    expect((await upload()).status).toBe(429);
  });
});
