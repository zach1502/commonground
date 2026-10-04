import { defineConfig } from 'vitest/config';

import { SOURCE_CONDITION } from '../../vitest.shared.config.ts';

// Only the @live tests. They call a real model endpoint when PARKSHAPE_LIVE=1 and AI_API_KEY
// is set, and skip otherwise. Run them with `pnpm --filter @parkshape/ai test:live`.
export default defineConfig({
  resolve: { conditions: [SOURCE_CONDITION] },
  ssr: { resolve: { conditions: [SOURCE_CONDITION] } },
  test: { include: ['src/__live__/**/*.test.ts'] },
});
