import { describe, expect, it } from 'vitest';

import type { Project } from '../api/web-api';
import { messages } from '../messages';

import { projectFacts } from './project-facts';

function projectNamed(
  name: string,
  sideM: number,
  phase: Pick<Project, 'phase' | 'closesAt'> = { phase: 'open', closesAt: '2026-10-31' },
): Project {
  const polygon = [
    { x: 0, y: 0 },
    { x: sideM, y: 0 },
    { x: sideM, y: sideM },
    { x: 0, y: sideM },
  ];
  return { name, parcel: { polygon }, ...phase } as unknown as Project;
}

describe('projectFacts', () => {
  it('gives the demo park its area, neighbourhood and closing day from the field', () => {
    const facts = projectFacts(projectNamed(messages.landing.heading, 120));
    expect(facts).toBe(
      '1.4 ha park. Mount Pleasant, Vancouver. Send your design by 31 October 2026.',
    );
  });

  it('gives any other park its area and its own closing day', () => {
    const park = projectNamed('Grandview Park', 100, { phase: 'open', closesAt: '2026-12-01' });
    expect(projectFacts(park)).toBe('1 ha park. Send your design by 1 December 2026.');
  });

  it('says design is closed when the phase is closed', () => {
    const park = projectNamed('Grandview Park', 100, { phase: 'closed', closesAt: '2026-12-01' });
    expect(projectFacts(park)).toBe('1 ha park. Design closed.');
  });
});
