import { describe, expect, it } from 'vitest';

import { CONTRACT_START, MINUTE_MS, makeWorld, seedUser } from './fixtures.js';
import type { RepositoriesFactory } from './fixtures.js';

/** Behaviour every UserRepository adapter must have. */
export function userRepositoryContract(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the UserRepository contract`, () => {
    it('creates a user stamped with the clock and no self report', async () => {
      const { repos } = await makeWorld(factory);
      const user = await seedUser(repos);
      expect(user).toEqual({
        id: 'user-a',
        role: 'resident',
        displayName: 'Person user-a',
        selfReport: null,
        createdAt: CONTRACT_START,
      });
      expect(await repos.users.findById('user-a')).toEqual(user);
    });

    it('refreshes name and role on a second upsert but keeps createdAt', async () => {
      const { repos, clock } = await makeWorld(factory);
      await seedUser(repos);
      clock.advance(MINUTE_MS);
      const again = await repos.users.upsert({ id: 'user-a', role: 'staff', displayName: 'New' });
      expect(again.role).toBe('staff');
      expect(again.displayName).toBe('New');
      expect(again.createdAt).toEqual(CONTRACT_START);
    });

    it('stores a self report, returns it on reads and keeps it through a later upsert', async () => {
      const { repos } = await makeWorld(factory);
      await seedUser(repos);
      const report = { fsa: 'V5T', ageBand: '30-44' };
      const saved = await repos.users.setSelfReport('user-a', report);
      expect(saved?.selfReport).toEqual(report);
      expect((await repos.users.findById('user-a'))?.selfReport).toEqual(report);
      await repos.users.upsert({ id: 'user-a', role: 'resident', displayName: 'Again' });
      expect((await repos.users.findById('user-a'))?.selfReport).toEqual(report);
    });

    it('replaces an earlier self report and ignores unknown users', async () => {
      const { repos } = await makeWorld(factory);
      await seedUser(repos);
      await repos.users.setSelfReport('user-a', { fsa: 'V5T', ageBand: null });
      const replaced = await repos.users.setSelfReport('user-a', { fsa: null, ageBand: '65-plus' });
      expect(replaced?.selfReport).toEqual({ fsa: null, ageBand: '65-plus' });
      expect(
        await repos.users.setSelfReport('nobody', { fsa: null, ageBand: null }),
      ).toBeUndefined();
    });

    it('returns undefined for an unknown user', async () => {
      const { repos } = await makeWorld(factory);
      expect(await repos.users.findById('nobody')).toBeUndefined();
    });
  });
}
