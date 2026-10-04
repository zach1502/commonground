import { describe, expect, it } from 'vitest';

import { CONTEXT_LAYER_DEFAULTS } from '@parkshape/core';

import { entranceTargetsFor } from './entrance-targets.js';
import { sampleSiteContext } from './sample-context.js';

const parcel = [
  { x: 0, y: 0 },
  { x: 176, y: 0 },
  { x: 176, y: 86 },
  { x: 0, y: 86 },
];

describe('entranceTargetsFor', () => {
  it('gives the parcel and every sidewalk line once the context has loaded', () => {
    const targets = entranceTargetsFor({
      load: { kind: 'ready', context: sampleSiteContext },
      parcel,
      visible: CONTEXT_LAYER_DEFAULTS,
    });
    const sidewalks = sampleSiteContext.features.filter((feature) => feature.kind === 'sidewalk');
    expect(targets?.parcel).toEqual(parcel);
    expect(targets?.sidewalks).toHaveLength(sidewalks.length);
  });

  it('gives nothing while the context loads or after it failed, so the grid snap is unchanged', () => {
    const visible = CONTEXT_LAYER_DEFAULTS;
    expect(entranceTargetsFor({ load: { kind: 'loading' }, parcel, visible })).toBeNull();
    expect(entranceTargetsFor({ load: { kind: 'failed' }, parcel, visible })).toBeNull();
  });

  it('gives nothing while the sidewalk layer is off, so a path never snaps to a hidden line', () => {
    const targets = entranceTargetsFor({
      load: { kind: 'ready', context: sampleSiteContext },
      parcel,
      visible: { ...CONTEXT_LAYER_DEFAULTS, sidewalk: 'off' },
    });
    expect(targets).toBeNull();
  });
});
