import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createProject, submitGarden } from './fixtures.js';
import { KEVIN, BOB, MOLLY, SALLY, STAFF, startHarness, type Harness } from './harness.js';

let h: Harness;
const cookies = new Map<string, string>();
const as = (persona: string) => cookies.get(persona) ?? '';

// Harness and sign-ins start in the hook, where vitest.config.ts gives pglite its budget.
beforeAll(async () => {
  h = await startHarness({ RATE_LIMIT_SUBMISSIONS_PER_HOUR: '100' });
  for (const persona of [STAFF, BOB, MOLLY, KEVIN, SALLY]) {
    cookies.set(persona, await h.login(persona));
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await h.close();
});

/** Spies on the reads that load whole design documents, about 15 KB each for a real design. */
function documentReads() {
  return [
    vi.spyOn(h.deps.repos.designs, 'findById'),
    vi.spyOn(h.deps.repos.designs, 'listByProject'),
  ];
}

describe('hot routes read design summaries, not documents', () => {
  it('casts and changes a vote without loading a design document', async () => {
    const project = await createProject(h, as(STAFF));
    const design = await submitGarden(h, as(BOB), project.id);
    const reads = documentReads();
    for (const value of [1, -1]) {
      const body = { designId: design.id, value, reasons: [] };
      expect((await h.call('POST', '/votes', { cookie: as(SALLY), body })).status).toBe(200);
    }
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });

  it('reads the design and its project for a vote in one query', async () => {
    const project = await createProject(h, as(STAFF));
    const design = await submitGarden(h, as(BOB), project.id);
    const separate = [
      vi.spyOn(h.deps.repos.designs, 'findSummaryById'),
      vi.spyOn(h.deps.repos.projects, 'findById'),
    ];
    const body = { designId: design.id, value: 1, reasons: [] };
    expect((await h.call('POST', '/votes', { cookie: as(KEVIN), body })).status).toBe(200);
    for (const read of separate) expect(read).not.toHaveBeenCalled();
  });

  it('builds the review queue and the leaderboard without loading documents', async () => {
    const project = await createProject(h, as(STAFF));
    await submitGarden(h, as(BOB), project.id);
    await submitGarden(h, as(MOLLY), project.id);
    const reads = documentReads();
    const queue = await h.call('GET', `/projects/${project.id}/queue?n=5`, { cookie: as(KEVIN) });
    const board = await h.call('GET', `/projects/${project.id}/leaderboard`, {
      cookie: as(KEVIN),
    });
    expect([queue.status, board.status]).toEqual([200, 200]);
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });

  it('reads full summaries only for the designs the queue picked', async () => {
    const project = await createProject(h, as(STAFF));
    for (const author of [BOB, MOLLY, SALLY]) await submitGarden(h, as(author), project.id);
    const listed = vi.spyOn(h.deps.repos.designs, 'listSummariesByProject');
    const picked = vi.spyOn(h.deps.repos.designs, 'findSummariesByIds');
    const queue = await h.call('GET', `/projects/${project.id}/queue?n=2`, { cookie: as(KEVIN) });
    expect(queue.status).toBe(200);
    expect(listed).not.toHaveBeenCalled();
    expect(picked).toHaveBeenCalledTimes(1);
    expect(picked.mock.calls[0]?.[0]).toHaveLength(2);
  });
});
