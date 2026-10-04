import { describe, expect, it } from 'vitest';

import type { DraftSaveResult } from '../design-repository.js';
import type { Design } from '../records.js';

import {
  CONTRACT_START,
  MINUTE_MS,
  SEED_DOCUMENT,
  makeWorld,
  seedDraft,
  seedProject,
  seedUser,
  submittedDesign,
  uncapped,
} from './fixtures.js';
import type { RepositoriesFactory } from './fixtures.js';

const TAB_A = { title: 'Tab A', blurb: 'From tab A.', document: { version: 1, items: ['a'] } };
const TAB_B = { title: 'Tab B', blurb: 'From tab B.', document: { version: 1, items: ['b'] } };

async function withDraft(factory: RepositoriesFactory) {
  const world = await makeWorld(factory);
  const author = await seedUser(world.repos);
  const project = await seedProject(world.repos);
  const draft = await seedDraft(world.repos, project.id, author.id);
  return { ...world, draft };
}

function savedDesign(result: DraftSaveResult): Design {
  if (result.kind !== 'saved') throw new Error(`updateDraft returned ${result.kind}`);
  return result.design;
}

function stamps(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the DesignRepository contract: draft stamps`, () => {
    it('stamps a new draft with its creation time', async () => {
      const { draft } = await withDraft(factory);
      expect(draft.updatedAt).toEqual(CONTRACT_START);
    });

    it('moves the stamp on every save, even when the clock has not moved', async () => {
      const { repos, draft } = await withDraft(factory);
      const first = savedDesign(await repos.designs.updateDraft(draft.id, TAB_A));
      const second = savedDesign(await repos.designs.updateDraft(draft.id, TAB_B));
      expect(first.updatedAt.getTime()).toBeGreaterThan(draft.updatedAt.getTime());
      expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
      expect(await repos.designs.findById(draft.id)).toEqual(second);
    });

    it('stamps a save with the clock when the clock is ahead of the last stamp', async () => {
      const { repos, draft, clock } = await withDraft(factory);
      clock.advance(MINUTE_MS);
      const saved = savedDesign(await repos.designs.updateDraft(draft.id, TAB_A));
      expect(saved.updatedAt).toEqual(new Date(CONTRACT_START.getTime() + MINUTE_MS));
    });
  });
}

function staleStamps(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the DesignRepository contract: stale stamps`, () => {
    it('saves when the expected stamp matches the stored one', async () => {
      const { repos, draft } = await withDraft(factory);
      const changes = { ...TAB_A, expectedUpdatedAt: draft.updatedAt };
      expect(savedDesign(await repos.designs.updateDraft(draft.id, changes))).toMatchObject(TAB_A);
    });

    it('refuses a stale stamp and returns the stored draft unchanged', async () => {
      const { repos, draft } = await withDraft(factory);
      const tabA = savedDesign(
        await repos.designs.updateDraft(draft.id, { ...TAB_A, expectedUpdatedAt: draft.updatedAt }),
      );
      const tabB = await repos.designs.updateDraft(draft.id, {
        ...TAB_B,
        expectedUpdatedAt: draft.updatedAt,
      });
      expect(tabB).toEqual({ kind: 'changed', current: tabA });
      expect(await repos.designs.findById(draft.id)).toEqual(tabA);
    });

    it('lets exactly one of two saves from the same stamp through', async () => {
      const { repos, draft } = await withDraft(factory);
      const results = await Promise.all([
        repos.designs.updateDraft(draft.id, { ...TAB_A, expectedUpdatedAt: draft.updatedAt }),
        repos.designs.updateDraft(draft.id, { ...TAB_B, expectedUpdatedAt: draft.updatedAt }),
      ]);
      expect(results.map((result) => result.kind).sort()).toEqual(['changed', 'saved']);
    });

    it('refuses a save to a missing design or one that is no longer a draft', async () => {
      const { repos, draft } = await withDraft(factory);
      expect(await repos.designs.updateDraft('missing', TAB_A)).toEqual({ kind: 'not-draft' });
      submittedDesign(await repos.designs.submit(draft.id, uncapped({}, SEED_DOCUMENT)));
      const late = { ...TAB_A, expectedUpdatedAt: draft.updatedAt };
      expect(await repos.designs.updateDraft(draft.id, late)).toEqual({ kind: 'not-draft' });
    });

    it('stamps a new version with the time it was made', async () => {
      const { repos, draft, clock } = await withDraft(factory);
      submittedDesign(await repos.designs.submit(draft.id, uncapped({}, SEED_DOCUMENT)));
      clock.advance(MINUTE_MS);
      const version = await repos.designs.createVersion(draft.id);
      expect(version.kind === 'created' ? version.design.updatedAt : version.kind).toEqual(
        new Date(CONTRACT_START.getTime() + MINUTE_MS),
      );
    });
  });
}

/** Saves carry the stamp the caller last read; a stale stamp never overwrites. */
export function draftSaveContract(name: string, factory: RepositoriesFactory): void {
  stamps(name, factory);
  staleStamps(name, factory);
}
