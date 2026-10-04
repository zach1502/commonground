import { z } from 'zod';

import type { UserRole } from '../ports/records.js';

import { readSeedJson } from './seed-files.js';

/** A made-up person the seed signs in as. */
export interface SeedPersona {
  readonly id: string;
  readonly displayName: string;
  readonly role: UserRole;
}

export interface SeedPeople {
  readonly residents: readonly SeedPersona[];
  readonly staff: SeedPersona;
}

export const RESIDENT_COUNT = 30;
// 11 shares no factor with 30, so stepping through the surnames by 11 uses each one once.
const SURNAME_STRIDE = 11;
const ID_PREFIX = 'seed';

const nameSchema = z.object({ first: z.string().min(1), last: z.string().min(1) });

export const nameListsSchema = z.object({
  first: z.array(z.string().min(1)).length(RESIDENT_COUNT),
  last: z.array(z.string().min(1)).length(RESIDENT_COUNT),
  staff: nameSchema,
});

export type NameLists = z.output<typeof nameListsSchema>;

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function persona(first: string, last: string, role: UserRole): SeedPersona {
  return { id: `${ID_PREFIX}-${slug(first)}-${slug(last)}`, displayName: `${first} ${last}`, role };
}

/** The name lists in packages/db/seed/names.json. */
export function loadNameLists(): NameLists {
  return nameListsSchema.parse(readSeedJson('names.json'));
}

/** 30 residents and 1 staff member; the same lists always give the same people. */
export function seedPeople(names: NameLists = loadNameLists()): SeedPeople {
  const residents = names.first.map((first, index) =>
    persona(first, names.last[(index * SURNAME_STRIDE) % RESIDENT_COUNT] ?? '', 'resident'),
  );
  return { residents, staff: persona(names.staff.first, names.staff.last, 'staff') };
}
