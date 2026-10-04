import { describe, expect, it } from 'vitest';

import { treeProfile } from './tree-lookup.js';

describe('treeProfile', () => {
  it('maps western red cedar to the catalog item and its mature crown', () => {
    const profile = treeProfile({ genus: 'THUJA', species: 'PLICATA', dbhCm: 61 });
    expect(profile).toEqual({
      catalogId: 'western-red-cedar',
      crownRadiusMatureM: 5.5,
      crownRadiusM: 5.5,
      suggestedLocked: true,
    });
  });

  it('estimates a young tree crown from its trunk and leaves it unlocked', () => {
    const profile = treeProfile({ genus: 'ACER', species: 'GRISEUM', dbhCm: 5.1 });
    expect(profile.catalogId).toBeUndefined();
    expect(profile.crownRadiusMatureM).toBe(5);
    expect(profile.crownRadiusM).toBe(1);
    expect(profile.suggestedLocked).toBe(false);
  });

  it('suggests locking only above 30 cm trunk diameter', () => {
    expect(treeProfile({ genus: 'PRUNUS', species: 'CERASIFERA', dbhCm: 30 }).suggestedLocked).toBe(
      false,
    );
    expect(
      treeProfile({ genus: 'PRUNUS', species: 'CERASIFERA', dbhCm: 30.1 }).suggestedLocked,
    ).toBe(true);
  });

  it('uses a default crown for a genus it does not list, and ignores case', () => {
    const profile = treeProfile({ genus: 'ginkgo', species: 'biloba', dbhCm: 20 });
    expect(profile.crownRadiusMatureM).toBe(4);
    expect(profile.crownRadiusM).toBe(2.5);
  });

  it('treats a missing trunk diameter as small and unlocked', () => {
    const profile = treeProfile({ genus: 'QUERCUS', species: 'GARRYANA', dbhCm: undefined });
    expect(profile).toMatchObject({
      catalogId: 'garry-oak',
      crownRadiusM: 1,
      suggestedLocked: false,
    });
  });
});
