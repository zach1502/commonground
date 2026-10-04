import { defineConfig } from 'vitest/config';

import { SOURCE_CONDITION } from '../../vitest.shared.config.ts';

// Only the @live tests, which call HRDEM, Vancouver Open Data and Overpass for real.
export default defineConfig({
  resolve: { conditions: [SOURCE_CONDITION] },
  ssr: { resolve: { conditions: [SOURCE_CONDITION] } },
  test: { include: ['src/__live__/**/*.test.ts'] },
});
