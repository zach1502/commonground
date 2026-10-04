import { describe, expect, it } from 'vitest';

import { loadNameLists, RESIDENT_COUNT, seedPeople } from './personas.js';

describe('seedPeople', () => {
  it('makes 30 residents with unique ids and names, and one staff member', () => {
    const { residents, staff } = seedPeople();
    expect(residents).toHaveLength(RESIDENT_COUNT);
    expect(new Set(residents.map(({ id }) => id)).size).toBe(RESIDENT_COUNT);
    expect(new Set(residents.map(({ displayName }) => displayName)).size).toBe(RESIDENT_COUNT);
    expect(residents.every(({ role }) => role === 'resident')).toBe(true);
    expect(staff).toEqual({ id: 'seed-joanne-mah', displayName: 'Joanne Mah', role: 'staff' });
  });

  it('uses every surname once and gives the same people on every call', () => {
    const names = loadNameLists();
    const surnames = seedPeople(names).residents.map(
      ({ displayName }) => displayName.split(' ')[1],
    );
    expect(new Set(surnames).size).toBe(names.last.length);
    expect(seedPeople(names)).toEqual(seedPeople(names));
  });

  it('turns names into url-safe ids', () => {
    const names = { ...loadNameLists(), staff: { first: 'Anne-Marie', last: "O'Neil" } };
    expect(seedPeople(names).staff.id).toBe('seed-anne-marie-o-neil');
  });
});
