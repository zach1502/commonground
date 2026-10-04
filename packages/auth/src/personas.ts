import type { UserRole } from './ports/auth-provider.js';

/** A ready-made person to sign in as with the mock provider. */
export interface Persona {
  readonly id: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly about: string;
}

// The names are made up, and each surname hints at what that person wants from the park.
export const PERSONAS: readonly Persona[] = [
  {
    id: 'persona-bob-walksadog',
    displayName: 'Bob Walksadog',
    role: 'resident',
    about: 'Walks his dog often; wants a larger dog area',
  },
  {
    id: 'persona-molly-swingset',
    displayName: 'Molly Swingset',
    role: 'resident',
    about: 'Brings two kids after school; wants a bigger playground',
  },
  {
    id: 'persona-kevin-kickabout',
    displayName: 'Kevin Kickabout',
    role: 'resident',
    about: 'Plays weekend soccer; wants the field kept open',
  },
  {
    id: 'persona-sally-smoothpath',
    displayName: 'Sally Smoothpath',
    role: 'resident',
    about: 'Uses a wheelchair; wants smooth, gentle paths',
  },
  {
    id: 'persona-rose-evergreen',
    displayName: 'Rose Evergreen',
    role: 'resident',
    about: 'Lives across the street; wants quiet shade',
  },
  {
    id: 'persona-gail-marigold',
    displayName: 'Gail Marigold',
    role: 'resident',
    about: 'Grows food at home; wants more garden plots',
  },
  {
    id: 'persona-paula-blueprint',
    displayName: 'Paula Blueprint',
    role: 'staff',
    about: 'Runs the project; wants designs that meet the brief',
  },
];

/** The persona with this id, if there is one. */
export function findPersona(id: string): Persona | undefined {
  return PERSONAS.find((persona) => persona.id === id);
}
