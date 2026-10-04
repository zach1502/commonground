import { describe, expect, it } from 'vitest';

import { defaultParameters } from '@parkshape/core';

import type { SiteFeatures, TerrainLoad } from '../api/staff-api';

import { proposedBaseline } from './baseline';
import { parcelFrom, projectInputFrom } from './publish';
import { EMPTY_WIZARD } from './wizard-state';

const SITE: SiteFeatures = {
  parkName: 'Jonathan Rogers Park',
  parcel: {
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
    polygonLocal: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
    ],
    origin: { lat: 49.26, lon: -123.1 },
  },
  features: [],
};

const TERRAIN: TerrainLoad = {
  heightmapRef: 'terrain/abc.bin',
  provider: 'static',
  source: {
    name: 'NRCan HRDEM',
    licence: 'Open Government Licence - Canada',
    url: 'https://open.canada.ca',
  },
  crs: 'EPSG:3979',
  width: 100,
  height: 80,
  resolutionM: 1,
};

describe('parcelFrom', () => {
  it('names the parcel after the park and keeps the local outline and origin', () => {
    const parcel = parcelFrom(SITE, 'Jonathan Rogers Park refresh');
    expect(parcel).toMatchObject({
      id: 'jonathan-rogers-park',
      name: 'Jonathan Rogers Park refresh',
    });
    expect(parcel.polygon).toHaveLength(3);
  });

  it('makes an id from the project name for a drawn outline', () => {
    expect(parcelFrom({ ...SITE, parkName: null }, 'East side lot').id).toBe('east-side-lot');
    expect(parcelFrom({ ...SITE, parkName: null }, '!!!').id).toBe('drawn-site');
  });
});

describe('projectInputFrom', () => {
  it('waits for every step', () => {
    expect(projectInputFrom(EMPTY_WIZARD)).toBeNull();
  });

  it('moves drawn zones out of the baseline into the project', () => {
    const baseline = proposedBaseline([], {});
    const zone = {
      id: 'zone-1',
      kind: 'forbidden',
      label: 'Forbidden zone 1',
      polygon: SITE.parcel.polygonLocal,
    };
    const input = projectInputFrom({
      ...EMPTY_WIZARD,
      name: ' Jonathan Rogers Park ',
      features: SITE,
      terrain: TERRAIN,
      parameters: defaultParameters(),
      baseline: { ...baseline, zones: [zone] } as never,
    });
    expect(input).toMatchObject({ name: 'Jonathan Rogers Park', heightmapRef: 'terrain/abc.bin' });
    expect(input?.baselineDocument.zones).toEqual([]);
    expect(input?.zones).toEqual([zone]);
    expect(input?.closesAt).toBeNull();
  });

  it('sends the closing day the planner chose', () => {
    const input = projectInputFrom({
      ...EMPTY_WIZARD,
      name: 'Jonathan Rogers Park',
      features: SITE,
      terrain: TERRAIN,
      parameters: defaultParameters(),
      baseline: proposedBaseline([], {}),
      closesAt: '2026-10-31',
    });
    expect(input?.closesAt).toBe('2026-10-31');
  });
});
