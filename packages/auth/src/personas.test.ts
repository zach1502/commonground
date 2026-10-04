import { describe, expect, it } from 'vitest';

import { PERSONAS, findPersona } from './personas.js';
import { readCookie } from './ports/auth-provider.js';

describe('PERSONAS', () => {
  it('has six residents and one staff member with unique ids', () => {
    expect(PERSONAS.filter((persona) => persona.role === 'resident')).toHaveLength(6);
    expect(PERSONAS.filter((persona) => persona.role === 'staff')).toHaveLength(1);
    expect(new Set(PERSONAS.map((persona) => persona.id)).size).toBe(PERSONAS.length);
  });

  it('finds a persona by id', () => {
    expect(findPersona('persona-paula-blueprint')?.role).toBe('staff');
    expect(findPersona('nobody')).toBeUndefined();
  });
});

describe('readCookie', () => {
  it('reads one cookie and ignores names that only share a prefix', () => {
    expect(readCookie('ab=1; a=2', 'a')).toBe('2');
    expect(readCookie(undefined, 'a')).toBeUndefined();
  });
});
