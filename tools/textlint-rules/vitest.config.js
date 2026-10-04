import { definePackageConfig } from '../../vitest.shared.config.ts';

export default definePackageConfig({
  include: ['*.test.js'],
  coverageInclude: ['*.js'],
  coverageExclude: ['vitest.config.js', 'lint-locales.js'],
});
