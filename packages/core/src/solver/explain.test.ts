import { describe, expect, it } from 'vitest';

import { explainNote } from './explain.js';

describe('explainNote', () => {
  it('says where a feature went when its hint could not be met', () => {
    const note = explainNote({
      kind: 'hintMissed',
      name: 'Pond',
      hint: { kind: 'terrain', terrain: 'low' },
      zone: 'south',
    });
    expect(note).toBe('The pond did not fit on the low side. It is near the south edge instead.');
  });

  it('names corners, the centre and place hints plainly', () => {
    expect(
      explainNote({
        kind: 'hintMissed',
        name: 'Off-leash dog area',
        hint: { kind: 'zone', zone: 'south-east' },
        zone: 'centre',
      }),
    ).toBe(
      'The off-leash dog area did not fit in the south-east corner. It is in the centre instead.',
    );
    expect(
      explainNote({
        kind: 'hintMissed',
        name: 'Bench',
        hint: { kind: 'near', place: 'the playground' },
        zone: 'north-west',
      }),
    ).toBe('The bench did not fit near the playground. It is in the north-west corner instead.');
    expect(
      explainNote({
        kind: 'hintMissed',
        name: 'Basketball half court',
        hint: { kind: 'awayFrom', place: 'the houses' },
        zone: 'east',
      }),
    ).toBe(
      'The basketball half court did not fit away from the houses. It is near the east edge instead.',
    );
  });
});

describe('explainNote for terrain, misfits and repairs', () => {
  it('gives a phrase for every terrain preference', () => {
    const terrains = ['flat', 'high', 'edge'] as const;
    const notes = terrains.map((terrain) =>
      explainNote({
        kind: 'hintMissed',
        name: 'Lawn',
        hint: { kind: 'terrain', terrain },
        zone: 'north',
      }),
    );
    expect(notes).toEqual([
      'The lawn did not fit on flat ground. It is near the north edge instead.',
      'The lawn did not fit on the high ground. It is near the north edge instead.',
      'The lawn did not fit along the edge. It is near the north edge instead.',
    ]);
  });

  it('explains features that did not fit, places it cannot find and paths it cannot draw', () => {
    expect(explainNote({ kind: 'notPlaced', name: 'Tennis court', count: 1 })).toBe(
      'The tennis court did not fit in the park. Try a smaller size in the editor.',
    );
    expect(explainNote({ kind: 'notPlaced', name: 'Bench', count: 3 })).toBe(
      '3 bench items did not fit in the park. Try fewer in the editor.',
    );
    expect(explainNote({ kind: 'placeMissing', name: 'Bench', place: 'the moon' })).toBe(
      'The park has no moon, so the bench goes where it fits best.',
    );
    expect(explainNote({ kind: 'stayed', name: 'Community garden' })).toBe(
      'The community garden did not fit where you asked. It stays where it is now.',
    );
    expect(explainNote({ kind: 'unreached', name: 'Pond' })).toBe(
      'No path reaches the pond. Draw one in the editor.',
    );
  });

  it('reports canopy short of the goal and repairs', () => {
    expect(explainNote({ kind: 'canopyShort', percent: 24.46, target: 30 })).toBe(
      'Trees cover 24.5% of the park, short of the 30% goal. There was no room for more trees.',
    );
    expect(explainNote({ kind: 'added', name: 'Community garden' })).toBe(
      'A community garden was added because the project needs one.',
    );
    expect(explainNote({ kind: 'enlarged', name: 'Community garden', plots: 20 })).toBe(
      'The community garden was made larger to fit 20 plots.',
    );
    expect(explainNote({ kind: 'added', name: 'Off-leash dog area' })).toBe(
      'An off-leash dog area was added because the project needs one.',
    );
    expect(explainNote({ kind: 'stillFailing', message: 'Add a garden.' })).toBe('Add a garden.');
  });
});
