import { performance } from 'node:perf_hooks';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DATABASE_QUERY_TIMEOUT_MS } from '@parkshape/db';

import { createProject, submitGarden } from '../fixtures.js';
import {
  KEVIN,
  BOB,
  MOLLY,
  SALLY,
  STAFF,
  errorKind,
  startHarness,
  type Harness,
} from '../harness.js';

import { privatePostgres } from './postgres-control.js';

const control = await privatePostgres();

const VOTERS = [STAFF, MOLLY, KEVIN, SALLY];
const WAVES = 12;
const OK = 200;
const UNAVAILABLE = 503;
// Every request in a wave settles within the query timeout, with room for a loaded machine.
const SETTLE_BUDGET_MS = DATABASE_QUERY_TIMEOUT_MS + 2000;
const RECOVERY_DEADLINE_MS = 20_000;
const POLL_MS = 100;
const OUTAGE_TEST_TIMEOUT_MS = 60_000;

interface Outcome {
  readonly status: number;
  readonly kind: string | undefined;
  readonly ms: number;
}

const unhandled: unknown[] = [];
const recordUnhandled = (reason: unknown) => unhandled.push(reason);
let h: Harness;
let designId = '';
const cookies = new Map<string, string>();

async function vote(persona: string, value: 1 | -1): Promise<Outcome> {
  const started = performance.now();
  const response = await h.call('POST', '/votes', {
    cookie: cookies.get(persona) ?? '',
    body: { designId, value, reasons: [] },
  });
  return {
    status: response.status,
    kind: errorKind(response.body),
    ms: performance.now() - started,
  };
}

function wave(round: number): Promise<Outcome[]> {
  return Promise.all(VOTERS.map((persona) => vote(persona, round % 2 === 0 ? 1 : -1)));
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilReady(): Promise<void> {
  const deadline = performance.now() + RECOVERY_DEADLINE_MS;
  while (performance.now() < deadline) {
    if ((await h.call('GET', '/ready')).status === OK) return;
    await pause(POLL_MS);
  }
  throw new Error('the API did not report ready after the server came back');
}

describe.skipIf(control === undefined)(
  'a real Postgres server stopped during a burst of votes',
  () => {
    beforeAll(async () => {
      process.on('unhandledRejection', recordUnhandled);
      h = await startHarness({
        DATABASE_URL: control?.url ?? '',
        RATE_LIMIT_VOTES_PER_MINUTE: '10000',
        RATE_LIMIT_STORE: 'postgres',
      });
      for (const persona of [...VOTERS, BOB]) cookies.set(persona, await h.login(persona));
      const project = await createProject(h, cookies.get(STAFF) ?? '');
      designId = (await submitGarden(h, cookies.get(BOB) ?? '', project.id)).id;
    });

    afterAll(async () => {
      process.off('unhandledRejection', recordUnhandled);
      await h.close();
      await control?.remove();
    });

    it(
      'answers every in-flight vote with 200 or 503 in bounded time, then recovers without a restart',
      async () => {
        expect((await vote(MOLLY, 1)).status).toBe(OK);
        const outcomes: Outcome[] = [];
        const stopping = control?.stop();
        for (let round = 0; round < WAVES; round += 1) outcomes.push(...(await wave(round)));
        await stopping;
        outcomes.push(...(await wave(WAVES)));

        expect(outcomes.filter((o) => o.status !== OK && o.status !== UNAVAILABLE)).toEqual([]);
        const refused = outcomes.filter((o) => o.status === UNAVAILABLE);
        expect(refused.length).toBeGreaterThanOrEqual(VOTERS.length);
        expect(refused.every((o) => o.kind === 'databaseUnavailable')).toBe(true);
        expect(Math.max(...outcomes.map((o) => o.ms))).toBeLessThan(SETTLE_BUDGET_MS);
        expect((await h.call('GET', '/ready')).status).toBe(UNAVAILABLE);

        await control?.start();
        await waitUntilReady();
        expect((await wave(0)).map((o) => o.status)).toEqual(VOTERS.map(() => OK));
        expect(unhandled).toEqual([]);
      },
      OUTAGE_TEST_TIMEOUT_MS,
    );
  },
);
