import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { LEADERBOARD_CACHE_MS } from '../src/container.js';
import { leaderboardSchema } from '../src/contracts/participation.js';

import { createProject, submitGarden } from './fixtures.js';
import { KEVIN, BOB, MOLLY, SALLY, STAFF, startHarness, type Harness } from './harness.js';

let h: Harness;
const cookies = new Map<string, string>();
const as = (persona: string) => cookies.get(persona) ?? '';

// Harness and sign-ins start in the hook, where vitest.config.ts gives pglite its budget.
beforeAll(async () => {
  h = await startHarness({
    RATE_LIMIT_SUBMISSIONS_PER_HOUR: '100',
    RATE_LIMIT_VOTES_PER_MINUTE: '100',
  });
  for (const persona of [STAFF, BOB, MOLLY, KEVIN, SALLY]) {
    cookies.set(persona, await h.login(persona));
  }
});

afterAll(async () => {
  await h.close();
});

async function board(projectId: string, persona?: string) {
  const cookie = persona === undefined ? {} : { cookie: as(persona) };
  const response = await h.call('GET', `/projects/${projectId}/leaderboard`, cookie);
  return leaderboardSchema.parse(response.body);
}

function vote(persona: string, designId: string, value: 1 | -1) {
  return h.call('POST', '/votes', { cookie: as(persona), body: { designId, value, reasons: [] } });
}

async function twoDesigns() {
  const project = await createProject(h, as(STAFF));
  const a = await submitGarden(h, as(BOB), project.id);
  const b = await submitGarden(h, as(MOLLY), project.id);
  return { project, a, b };
}

describe('leaderboard cache', () => {
  it('ranks the live designs once per project for reads within the poll interval', async () => {
    const { project } = await twoDesigns();
    const listed = vi.spyOn(h.deps.repos.designs, 'listSummariesByProject');
    await board(project.id);
    await board(project.id, SALLY);
    expect(listed).toHaveBeenCalledTimes(1);
    h.clock.advance(LEADERBOARD_CACHE_MS + 1);
    await board(project.id);
    expect(listed).toHaveBeenCalledTimes(2);
    listed.mockRestore();
  });

  it('shows a vote on the next read', async () => {
    const { project, a, b } = await twoDesigns();
    await vote(SALLY, a.id, 1);
    expect((await board(project.id)).entries[0]?.design.id).toBe(a.id);
    await vote(KEVIN, b.id, 1);
    await vote(SALLY, b.id, 1);
    await vote(SALLY, a.id, -1);
    const entries = (await board(project.id)).entries;
    expect(entries.map((entry) => entry.design.id)).toEqual([b.id, a.id]);
    expect(entries[0]?.design.up).toBe(2);
  });

  it('shows a newly submitted design on the next read', async () => {
    const { project } = await twoDesigns();
    expect((await board(project.id)).entries).toHaveLength(2);
    await submitGarden(h, as(KEVIN), project.id);
    expect((await board(project.id)).entries).toHaveLength(3);
  });

  it('still reveals authors per viewer from the shared ranking', async () => {
    const { project, a } = await twoDesigns();
    await vote(KEVIN, a.id, 1);
    const anonymous = await board(project.id, SALLY);
    const voter = await board(project.id, KEVIN);
    const authorOf = (entries: typeof voter.entries) =>
      entries.find((entry) => entry.design.id === a.id)?.design.author;
    expect(authorOf(anonymous.entries)).toBeNull();
    expect(authorOf(voter.entries)).toEqual({ id: BOB, displayName: 'Bob Walksadog' });
  });
});
