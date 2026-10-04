// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The node environment keeps import.meta.url a file URL, so the path holds from the package
// run and from the root contract run alike.
const PLANNER_CSS = readFileSync(fileURLToPath(new URL('../planner.css', import.meta.url)), 'utf8');

describe('map attribution links', () => {
  it('are underlined, so they stand out from the attribution text without colour (WCAG 1.4.1)', () => {
    // MapLibre's own CSS gives the links the text colour and no underline; axe flags that as
    // link-in-text-block in WebKit.
    expect(PLANNER_CSS).toMatch(
      /\.ps-parcel-map \.maplibregl-ctrl-attrib a \{\s*text-decoration: underline;\s*\}/,
    );
  });
});
