import { describe, expect, it } from 'vitest';

import { cameraPreset, RESET_HEADING_RAD } from '../camera/presets.js';
import { centreOf, heightmapBounds } from '../geometry/sample.js';
import { heightmapFrom } from '../geometry/synthetic-heightmap.js';
import { PALETTE_FALLBACKS } from '../palette/colours.js';
import { renderFeatures } from '../perf/render-tier.js';

import { fillFor, lightRig, sceneTone, sunPosition } from './lighting.js';

const bounds = heightmapBounds(
  heightmapFrom({ width: 176, height: 86, resolutionM: 1 }, (_x, z) => 14 + 0.05 * z),
);
const DEG = Math.PI / 180;

function angleBetween(a: { x: number; y: number; z: number }, b: typeof a): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  return Math.acos(dot / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z)));
}

describe('sunPosition', () => {
  const sun = sunPosition(bounds, RESET_HEADING_RAD);

  it('aims at the parcel centre from 40 degrees above the horizon', () => {
    const offset = {
      x: sun.position.x - sun.target.x,
      y: sun.position.y - sun.target.y,
      z: sun.position.z - sun.target.z,
    };
    expect(sun.target).toEqual(centreOf(bounds));
    expect(Math.asin(offset.y / Math.hypot(offset.x, offset.y, offset.z))).toBeCloseTo(40 * DEG);
  });

  it('takes a higher sun when a caller asks for one, at the same turn', () => {
    const high = sunPosition(bounds, RESET_HEADING_RAD, 60 * DEG);
    const offset = {
      x: high.position.x - high.target.x,
      y: high.position.y - high.target.y,
      z: high.position.z - high.target.z,
    };
    const length = Math.hypot(offset.x, offset.y, offset.z);
    expect(Math.asin(offset.y / length)).toBeCloseTo(60 * DEG);
    expect(Math.atan2(offset.x, offset.z)).toBeCloseTo(
      Math.atan2(sun.position.x - sun.target.x, sun.position.z - sun.target.z),
    );
  });

  it('sits more than 60 degrees away from the reset view direction', () => {
    const view = cameraPreset('reset', bounds);
    const toCamera = {
      x: view.position.x - view.target.x,
      y: view.position.y - view.target.y,
      z: view.position.z - view.target.z,
    };
    const toSun = {
      x: sun.position.x - sun.target.x,
      y: sun.position.y - sun.target.y,
      z: sun.position.z - sun.target.z,
    };
    expect(angleBetween(toCamera, toSun)).toBeGreaterThan(60 * DEG);
  });

  it('turns 110 degrees around from the reset heading', () => {
    const heading = Math.atan2(sun.position.x - sun.target.x, sun.position.z - sun.target.z);
    const turn = (((heading - RESET_HEADING_RAD) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    expect(turn).toBeCloseTo(110 * DEG);
  });
});

describe('lightRig', () => {
  it('uses the warm sun and the sky over soil hemisphere from DESIGN.md', () => {
    const rig = lightRig(PALETTE_FALLBACKS, 'lights');
    expect(rig.sun.colour).toBe('#fff1dc');
    expect(rig.sun.intensity).toBeGreaterThanOrEqual(2.5);
    expect(rig.sun.intensity).toBeLessThanOrEqual(3);
    expect(rig.hemisphere).toEqual({ sky: '#cfe3f0', ground: '#5e4632', intensity: 0.75 });
    expect(rig.ambient).toBeGreaterThanOrEqual(0.1);
    expect(rig.ambient).toBeLessThanOrEqual(0.15);
  });
});

describe('lightRig with the generated environment', () => {
  it('drops the hemisphere to 0.3 and turns the ambient off', () => {
    const rig = lightRig(PALETTE_FALLBACKS, 'environment');
    expect(rig.hemisphere.intensity).toBe(0.3);
    expect(rig.ambient).toBe(0);
    expect(rig.environment).toEqual({ sky: '#cfe3f0', ground: '#5e4632' });
  });
});

describe('fillFor', () => {
  it('uses the environment unless the device has a major caveat', () => {
    expect(fillFor({ tier: 'phone', caveat: 'none' })).toBe('environment');
    expect(fillFor({ tier: 'phone', caveat: 'major' })).toBe('lights');
  });
});

describe('sceneTone', () => {
  const phone = sceneTone(renderFeatures({ tier: 'phone', caveat: 'none' }));
  const desktop = sceneTone(renderFeatures({ tier: 'desktop', caveat: 'none' }));

  it('keeps the phone tier at exposure 1 and the DESIGN.md fog density', () => {
    expect(phone).toEqual({ exposure: 1, fogDensity: 0.0015 });
  });

  it('lifts the composer exposure and thins its fog, which mixes before ACES there', () => {
    expect(desktop.exposure).toBeGreaterThan(phone.exposure);
    expect(desktop.exposure).toBeLessThanOrEqual(1.1);
    expect(desktop.fogDensity).toBeLessThan(phone.fogDensity);
    expect(desktop.fogDensity).toBeGreaterThanOrEqual(0.0005);
  });

  it('treats a software rasteriser like the phone tier', () => {
    expect(sceneTone(renderFeatures({ tier: 'desktop', caveat: 'major' }))).toEqual(phone);
  });
});
