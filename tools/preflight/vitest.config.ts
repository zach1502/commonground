import { definePackageConfig } from '../../vitest.shared.config.ts';

export default definePackageConfig({ coverageExclude: ['src/cli.ts', 'src/test-quick-cli.ts'] });
