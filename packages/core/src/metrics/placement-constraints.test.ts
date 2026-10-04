import { describe, expect, it } from 'vitest';

import type { ItemId } from '../schema/ids.js';

import { parametersWith } from './fixtures/design-builders.js';
import {
  slopesOutcome,
  terraformOutcome,
  treeProtectionOutcome,
  zonesOutcome,
} from './placement-constraints.js';
import type { TerraformMeasure } from './terraform.js';

const id = (value: string) => value as ItemId;
const limits = { maxRunning: 0.05, maxCross: 0.02 };
const levelPath = {
  pathId: id('p'),
  pathNumber: 2,
  existing: false,
  maxRunning: 0.01,
  maxCross: 0.01,
  runningSegments: [],
  crossSegments: [],
};

describe('zonesOutcome', () => {
  it('passes with no hits', () => {
    expect(zonesOutcome([], [])).toEqual({
      met: true,
      value: 0,
      limit: 0,
      message: 'No new element is in a closed zone or on a locked element.',
    });
  });

  it('names the first zone hit', () => {
    const hit = {
      elementId: id('b1'),
      label: 'Bench',
      zoneId: id('z'),
      zoneLabel: 'Sewer easement',
    };
    expect(zonesOutcome([hit], []).message).toBe(
      'Bench is in the closed zone Sewer easement. Move it outside the zone.',
    );
  });

  it('names the first locked overlap', () => {
    const overlap = {
      elementId: id('b1'),
      label: 'Bench',
      lockedId: id('wc'),
      lockedLabel: 'Washroom building',
    };
    expect(zonesOutcome([], [overlap])).toMatchObject({
      met: false,
      value: 1,
      message: 'Bench overlaps a locked Washroom building. Move it to open ground.',
    });
  });
});

describe('slopesOutcome', () => {
  it('passes level paths and names the wheelchair limits', () => {
    expect(slopesOutcome([levelPath], [], limits).message).toBe(
      'Every path is 5% grade or less and 2% or less across, so a wheelchair can use it. Ground under each item is within its limit.',
    );
  });

  it('states a steep path first', () => {
    const steep = { ...levelPath, maxRunning: 0.07, runningSegments: [0, 1] };
    expect(slopesOutcome([steep], [], limits)).toMatchObject({
      met: false,
      value: 1,
      message: 'Path 2 reaches 7% grade. Accessible paths are 5% or less.',
    });
  });

  it('states a cross slope', () => {
    const tilted = { ...levelPath, maxCross: 0.03, crossSegments: [4] };
    expect(slopesOutcome([tilted], [], limits).message).toBe(
      'Path 2 has a 3% cross slope. Accessible paths are 2% or less across.',
    );
  });

  it('states the grade under an item', () => {
    const grade = { id: id('play'), label: 'Playground structure', grade: 0.08, limit: 0.05 };
    expect(slopesOutcome([], [grade, { ...grade, grade: 0.01 }], limits)).toMatchObject({
      value: 1,
      message: 'Ground under Playground structure reaches 8% grade. Regrade it to 5% or less.',
    });
  });
});

const calm: TerraformMeasure = {
  cut: 6,
  fill: 6,
  net: 0,
  truckTrips: 0,
  disturbedPercent: 1,
  deviationCells: 0,
  largestDeviationM: 0.5,
  rootZoneHits: [],
  noGradeHits: [],
};

describe('terraformOutcome', () => {
  const { terraform } = parametersWith({
    terraform: { maxDeviationM: 5, maxNetHaulM3: 300, maxDisturbedPercent: 15 },
  });

  it('passes and states the volume moved', () => {
    expect(terraformOutcome(calm, terraform)).toEqual({
      met: true,
      value: 0,
      limit: 0,
      message: 'Grading moves 12 m³ and needs 0 truck loads.',
    });
  });

  it('states cells past the deviation limit', () => {
    expect(terraformOutcome({ ...calm, deviationCells: 3 }, terraform).message).toBe(
      '3 cells change grade by more than 5 m. Keep each change within 5 m.',
    );
  });

  it('states grading in a no-grade zone', () => {
    const noGradeHits = [{ zoneId: id('z'), zoneLabel: 'Creek bank', cells: 4 }];
    expect(terraformOutcome({ ...calm, noGradeHits }, terraform).message).toBe(
      'Grading covers 4 cells of the no-grade zone Creek bank. Remove grading there.',
    );
  });

  it('states net haul and disturbance past their limits', () => {
    expect(terraformOutcome({ ...calm, net: -420 }, terraform).message).toBe(
      'Net haul is 420 m³. Keep it at 300 m³ or less.',
    );
    expect(terraformOutcome({ ...calm, disturbedPercent: 22 }, terraform)).toMatchObject({
      value: 1,
      message: 'Grading covers 22% of the park. Keep it at 15% or less.',
    });
  });

  it('skips the optional limits when they are not set', () => {
    const open = parametersWith().terraform;
    expect(terraformOutcome({ ...calm, net: 900, disturbedPercent: 90 }, open).met).toBe(true);
  });
});

describe('treeProtectionOutcome', () => {
  it('passes with no root zone hits', () => {
    expect(treeProtectionOutcome([]).message).toBe(
      'No grading is inside the root zone of a locked tree.',
    );
  });

  it('names the first tree and counts every cell', () => {
    const hit = { treeId: id('t1'), label: 'Bigleaf maple', radiusM: 9.6, cells: 3 };
    expect(treeProtectionOutcome([hit, { ...hit, cells: 2 }])).toMatchObject({
      met: false,
      value: 5,
      message:
        'Grading reaches 3 cells inside the 9.6 m root zone of Bigleaf maple. Keep grading outside the root zone.',
    });
  });
});
