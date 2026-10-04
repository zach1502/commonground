import { createApp, createApiContainer } from '@parkshape/api';
import { loadConfigFromProcess } from '@parkshape/config';

import { withFixedRules } from './seed-config.js';
import { seedDemo } from './seed-demo.js';

const JSON_INDENT = 2;

/** `pnpm seed`: seeds the database at DATABASE_URL through an in-process API. */
async function main(): Promise<void> {
  // The seed always runs on the fixed rules, even when .env holds a Gemini key.
  const container = await createApiContainer(withFixedRules(loadConfigFromProcess()));
  try {
    const summary = await seedDemo(createApp(container.deps), container.deps);
    process.stdout.write(`${JSON.stringify(summary, null, JSON_INDENT)}\n`);
  } finally {
    await container.close();
  }
}

await main();
