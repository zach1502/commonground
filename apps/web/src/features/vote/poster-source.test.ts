import { describe, expect, it } from 'vitest';

import { readPalette } from '@parkshape/scene/plan';

import type { Design, DesignSummary, Project } from '../../api/web-api';

import { drawPlan } from './plan-drawing';
import { posterFor } from './poster-source';

const PARCEL = {
  id: 'jrp',
  name: 'Jonathan Rogers Park',
  polygon: [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 20 },
  ],
  origin: { lat: 49.26, lon: -123.1 },
};
const PROJECT = { id: 'jrp', parcel: PARCEL } as unknown as Project;
const DOCUMENT = {
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
};

function summary(thumbnailUrl: string | null): DesignSummary {
  return { id: 'a', title: 'Loop park', thumbnailUrl } as unknown as DesignSummary;
}

function full(id: string, document: unknown = DOCUMENT): Design {
  return { id, title: 'Loop park', thumbnailUrl: null, document } as unknown as Design;
}

const base = { project: PROJECT, palette: readPalette(() => ''), drawPlan };

describe('posterFor', () => {
  it('waits while there is no design to show', () => {
    expect(posterFor({ ...base, summary: null, full: null })).toBeNull();
  });

  it('uses the stored thumbnail when the design has one', () => {
    const poster = posterFor({ ...base, summary: summary('/t/a.png'), full: null });
    expect(poster).toEqual({ title: 'Loop park', thumbnailUrl: '/t/a.png' });
  });

  it('waits for the full design when there is no thumbnail yet', () => {
    expect(posterFor({ ...base, summary: summary(null), full: null })).toBeNull();
    expect(posterFor({ ...base, summary: summary(null), full: full('b') })).toBeNull();
  });

  it('draws a flat plan from the full design when there is no thumbnail', () => {
    const poster = posterFor({ ...base, summary: summary(null), full: full('a') });
    expect(poster?.title).toBe('Loop park');
    expect(poster?.thumbnailUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it('waits while the plan drawing code is still loading', () => {
    const poster = posterFor({ ...base, drawPlan: null, summary: summary(null), full: full('a') });
    expect(poster).toBeNull();
  });

  it('needs no plan drawing code for a stored thumbnail', () => {
    const poster = posterFor({ ...base, drawPlan: null, summary: summary('/t/a.png'), full: null });
    expect(poster).toEqual({ title: 'Loop park', thumbnailUrl: '/t/a.png' });
  });

  it('gives no picture when the design cannot be drawn', () => {
    const poster = posterFor({ ...base, summary: summary(null), full: full('a', { version: 9 }) });
    expect(poster).toEqual({ title: 'Loop park', thumbnailUrl: null });
  });
});
