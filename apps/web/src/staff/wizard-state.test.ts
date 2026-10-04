import { describe, expect, it } from 'vitest';

import { defaultParameters } from '@parkshape/core';

import { proposedBaseline } from './baseline';
import {
  applyChange,
  EMPTY_WIZARD,
  loadWizard,
  saveWizard,
  WIZARD_STORAGE_KEY,
  type ChosenSite,
} from './wizard-state';
import {
  canOpen,
  doneSteps,
  firstOpenStep,
  nextStep,
  previousStep,
  stepHref,
} from './wizard-steps';

const SITE: ChosenSite = {
  parkName: 'Jonathan Rogers Park',
  polygonWgs84: {
    type: 'Polygon',
    coordinates: [
      [
        [-123.1, 49.26],
        [-123.09, 49.26],
        [-123.09, 49.27],
        [-123.1, 49.26],
      ],
    ],
  },
};

describe('wizard storage', () => {
  it('loads a saved wizard from before the closing day field, with no day set', () => {
    const older: Record<string, unknown> = { ...EMPTY_WIZARD, name: 'Kept' };
    delete older.closesAt;
    window.sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(older));
    expect(loadWizard(window.sessionStorage)).toMatchObject({ name: 'Kept', closesAt: '' });
  });

  it('starts empty and round-trips through sessionStorage', () => {
    window.sessionStorage.clear();
    expect(loadWizard(window.sessionStorage)).toEqual(EMPTY_WIZARD);
    const state = {
      ...EMPTY_WIZARD,
      query: 'Jonathan',
      site: SITE,
      parameters: defaultParameters(),
    };
    saveWizard(window.sessionStorage, state);
    expect(loadWizard(window.sessionStorage)).toEqual(state);
  });

  it('falls back to empty when the stored copy does not parse', () => {
    window.sessionStorage.setItem(WIZARD_STORAGE_KEY, '{not json');
    expect(loadWizard(window.sessionStorage)).toEqual(EMPTY_WIZARD);
    window.sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ version: 2 }));
    expect(loadWizard(window.sessionStorage)).toEqual(EMPTY_WIZARD);
  });
});

describe('applyChange', () => {
  it('clears later answers when the site changes', () => {
    const filled = { ...EMPTY_WIZARD, site: SITE, locks: { a: 'locked' as const }, name: 'Park' };
    const next = applyChange(filled, { site: { ...SITE, parkName: 'Other' } });
    expect(next).toMatchObject({ locks: {}, terrain: null, name: 'Park' });
  });

  it('clears the refined baseline when the locks change and keeps it otherwise', () => {
    const baseline = proposedBaseline([], {});
    const filled = { ...EMPTY_WIZARD, baseline };
    expect(applyChange(filled, { locks: { a: 'unlocked' } }).baseline).toBeNull();
    expect(applyChange(filled, { name: 'New name' }).baseline).toEqual(baseline);
  });
});

describe('wizard steps', () => {
  it('opens only steps whose earlier steps are done', () => {
    expect(firstOpenStep(EMPTY_WIZARD)).toBe('site');
    expect(canOpen('site', EMPTY_WIZARD)).toBe(true);
    expect(canOpen('terrain', EMPTY_WIZARD)).toBe(false);
    const withSite = { ...EMPTY_WIZARD, site: SITE };
    expect(doneSteps(withSite)).toEqual(['site']);
    expect(canOpen('terrain', withSite)).toBe(true);
    expect(firstOpenStep(withSite)).toBe('terrain');
  });

  it('walks forward and back through the six steps', () => {
    expect(nextStep('site')).toBe('terrain');
    expect(nextStep('publish')).toBe('publish');
    expect(previousStep('site')).toBeNull();
    expect(previousStep('publish')).toBe('refine');
    expect(stepHref('review')).toBe('/staff/projects/new/review');
  });
});
