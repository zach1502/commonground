import { describe, expect, it } from 'vitest';

import { sceneTierFor } from './scene-tier';

describe('sceneTierFor', () => {
  it('pins the desktop look when a test build asks with ?tier=desktop', () => {
    expect(sceneTierFor('on', '?tier=desktop')).toBe('desktop-pinned');
  });

  it('leaves the probe in charge for real users, whatever the URL says', () => {
    expect(sceneTierFor('off', '?tier=desktop')).toBeUndefined();
  });

  it('leaves the probe in charge in a test build without the parameter', () => {
    expect(sceneTierFor('on', '')).toBeUndefined();
    expect(sceneTierFor('on', '?tier=phone')).toBeUndefined();
  });
});
