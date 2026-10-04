import { describe, expect, it } from 'vitest';

import { polygonArea } from '@parkshape/core';

import { JONATHAN_ROGERS_POLYGON } from '../../ports/__contracts__/jonathan-rogers.js';

import { siteFrameFor } from './site-frame.js';

describe('siteFrameFor', () => {
  const site = siteFrameFor(JONATHAN_ROGERS_POLYGON);

  it('drops the closing position so the local ring is implicitly closed', () => {
    expect(site.parcel.polygonLocal).toHaveLength(4);
  });

  it('matches the area Vancouver Open Data lists for the park within 1 percent', () => {
    // parks-polygon-representation gives area 14023.2 m2 for Jonathan Rogers Park.
    expect(polygonArea(site.parcel.polygonLocal) / 14_023.2).toBeCloseTo(1, 2);
  });

  it('turns a WGS84 position into a branded local point', () => {
    const point = site.localPoint([site.parcel.origin.lon, site.parcel.origin.lat]);
    expect(point.x).toBeCloseTo(0, 3);
    expect(point.y).toBeCloseTo(0, 3);
  });

  it('turns a WGS84 ring into a local polygon, or undefined when it is too short', () => {
    const ring = JONATHAN_ROGERS_POLYGON.coordinates[0] ?? [];
    expect(site.localPolygon(ring)).toHaveLength(4);
    expect(site.localPolygon(ring.slice(0, 2))).toBeUndefined();
  });

  it('puts the centre inside the parcel', () => {
    const centre = site.centre();
    expect(centre.x).toBeGreaterThan(0);
    expect(centre.y).toBeGreaterThan(0);
  });
});
