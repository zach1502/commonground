import { describe, expect, it } from 'vitest';

import { JONATHAN_ROGERS_POLYGON } from '../../ports/__contracts__/jonathan-rogers.js';

import {
  boxContains,
  bufferedParcelBox,
  clipPolyline,
  nearestOnPolyline,
  parcelPolygonWgs84,
  roundedPoint,
} from './context-box.js';
import { siteFrameFor } from './site-frame.js';

const BOX = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

describe('bufferedParcelBox', () => {
  it('grows the parcel box by the buffer on every side', () => {
    const box = bufferedParcelBox(
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 5 },
      ],
      3,
    );
    expect(box).toEqual({ minX: -3, minY: -3, maxX: 23, maxY: 8 });
  });
});

describe('clipPolyline', () => {
  it('keeps a line that lies inside the box', () => {
    const line = [
      { x: 1, y: 1 },
      { x: 9, y: 9 },
    ];
    expect(clipPolyline(line, BOX)).toEqual([line]);
  });

  it('cuts a line that crosses the box at its edges', () => {
    const pieces = clipPolyline(
      [
        { x: -5, y: 5 },
        { x: 15, y: 5 },
      ],
      BOX,
    );
    expect(pieces).toEqual([
      [
        { x: 0, y: 5 },
        { x: 10, y: 5 },
      ],
    ]);
  });

  it('splits a line that leaves the box and comes back', () => {
    const pieces = clipPolyline(
      [
        { x: 2, y: 5 },
        { x: 2, y: 20 },
        { x: 8, y: 20 },
        { x: 8, y: 5 },
      ],
      BOX,
    );
    expect(pieces).toEqual([
      [
        { x: 2, y: 5 },
        { x: 2, y: 10 },
      ],
      [
        { x: 8, y: 10 },
        { x: 8, y: 5 },
      ],
    ]);
  });

  it('drops a line that stays outside the box', () => {
    const outside = [
      { x: 20, y: 20 },
      { x: 30, y: 20 },
    ];
    expect(clipPolyline(outside, BOX)).toEqual([]);
  });
});

describe('boxContains', () => {
  it('counts the edge as inside', () => {
    expect(boxContains(BOX, { x: 10, y: 0 })).toBe(true);
    expect(boxContains(BOX, { x: 10.01, y: 0 })).toBe(false);
  });
});

describe('nearestOnPolyline', () => {
  it('gives the foot, the distance and the segment direction', () => {
    const nearest = nearestOnPolyline({ x: 5, y: 3 }, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(nearest).toEqual({ point: { x: 5, y: 0 }, distance: 3, direction: { x: 1, y: 0 } });
  });
});

describe('roundedPoint', () => {
  it('rounds to the centimetre', () => {
    expect(roundedPoint({ x: 1.23456, y: -1.236 })).toEqual({ x: 1.23, y: -1.24 });
  });
});

describe('parcelPolygonWgs84', () => {
  it('rebuilds an outline whose local frame matches the stored parcel within 1 cm', () => {
    const site = siteFrameFor(JONATHAN_ROGERS_POLYGON);
    const rebuilt = parcelPolygonWgs84({
      polygon: site.parcel.polygonLocal,
      origin: site.parcel.origin,
    });
    const again = siteFrameFor(rebuilt).parcel.polygonLocal;
    site.parcel.polygonLocal.forEach((point, index) => {
      expect(Math.abs((again[index]?.x ?? 0) - point.x)).toBeLessThan(0.01);
      expect(Math.abs((again[index]?.y ?? 0) - point.y)).toBeLessThan(0.01);
    });
  });
});
