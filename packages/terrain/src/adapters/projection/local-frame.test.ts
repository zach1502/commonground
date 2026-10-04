import { describe, expect, it } from 'vitest';

import { JONATHAN_ROGERS_POLYGON } from '../../ports/__contracts__/jonathan-rogers.js';

import { localFrameFor, reprojectorFor } from './local-frame.js';

const EARTH_RADIUS_M = 6_371_008.8;
const MM = 0.001;

const WGS84_A = 6_378_137;
const WGS84_E2 = 0.006_694_379_990_14;
const toRad = (deg: number) => (deg * Math.PI) / 180;

function haversineM(
  a: readonly [number, number],
  b: readonly [number, number],
  radiusM = EARTH_RADIUS_M,
): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusM * Math.asin(Math.sqrt(h));
}

/** Euler's radius of curvature of the WGS84 ellipsoid along an azimuth at a latitude. */
function radiusAlong(azimuth: number, latDeg: number): number {
  const w = 1 - WGS84_E2 * Math.sin(toRad(latDeg)) ** 2;
  const meridian = (WGS84_A * (1 - WGS84_E2)) / w ** 1.5;
  const primeVertical = WGS84_A / Math.sqrt(w);
  return 1 / (Math.cos(azimuth) ** 2 / meridian + Math.sin(azimuth) ** 2 / primeVertical);
}

describe('localFrameFor', () => {
  const frame = localFrameFor(JONATHAN_ROGERS_POLYGON);

  it('round-trips a Vancouver point within 1 mm', () => {
    const cityHall: [number, number] = [-123.1139, 49.2609];
    const back = frame.toWgs84(frame.toLocal(cityHall));
    const drift = haversineM(cityHall, back);
    expect(drift).toBeLessThan(MM);
  });

  it('puts the bounding box minimum of the polygon at the local origin', () => {
    const points = frame.ringToLocal(JONATHAN_ROGERS_POLYGON);
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(0, 6);
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(0, 6);
  });

  it('keeps the origin as the WGS84 position of local (0, 0)', () => {
    const back = frame.toLocal([frame.origin.lon, frame.origin.lat]);
    expect(Math.hypot(back.x, back.y)).toBeLessThan(MM);
  });

  // Haversine on the mean sphere runs 0.3 percent short east-west at 49 N, because the
  // ellipsoid is wider there. Using the ellipsoid's radius of curvature along each side keeps
  // haversine as the check while measuring the projection, not the sphere.
  it('matches haversine distances within 0.1 percent', () => {
    const ring = JONATHAN_ROGERS_POLYGON.coordinates[0] ?? [];
    const pairs = ring.slice(1).map((to, index) => [ring[index] ?? to, to] as const);
    pairs.forEach(([from, to]) => {
      const a = frame.toLocal(from);
      const b = frame.toLocal(to);
      const planar = Math.hypot(b.x - a.x, b.y - a.y);
      const azimuth = Math.atan2(b.x - a.x, b.y - a.y);
      const expected = haversineM(from, to, radiusAlong(azimuth, from[1]));
      expect(Math.abs(planar - expected) / expected).toBeLessThan(0.001);
      expect(Math.abs(planar - haversineM(from, to)) / planar).toBeLessThan(0.005);
    });
  });

  it('points x east and y north', () => {
    const west = frame.toLocal([-123.1093, 49.2642]);
    const east = frame.toLocal([-123.107, 49.2642]);
    const north = frame.toLocal([-123.1093, 49.2646]);
    expect(east.x).toBeGreaterThan(west.x);
    expect(north.y).toBeGreaterThan(west.y);
  });
});

describe('reprojectorFor', () => {
  it('projects Jonathan Rogers Park into Canada Atlas Lambert (EPSG:3979)', () => {
    const result = reprojectorFor(3979);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [x, y] = result.value.fromWgs84([-123.1081, 49.2643]);
    // Reference values from the LCC formulas for EPSG:3979; the park sits near the 49N parallel.
    expect(x).toBeGreaterThan(-2_000_000);
    expect(x).toBeLessThan(-1_500_000);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(500_000);
    const [lon, lat] = result.value.toWgs84([x, y]);
    expect(haversineM([lon, lat], [-123.1081, 49.2643])).toBeLessThan(MM);
  });

  it('knows UTM zone 10N', () => {
    const result = reprojectorFor(32610);
    expect(result.ok && result.value.fromWgs84([-123, 0])[0]).toBeCloseTo(500_000, 3);
  });

  it('rejects a CRS it has no definition for', () => {
    expect(reprojectorFor(2154)).toEqual({
      ok: false,
      error: { kind: 'unsupportedCrs', crs: 'EPSG:2154' },
    });
  });
});
