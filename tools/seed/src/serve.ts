import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { serve } from '@hono/node-server';

import { createApp, createApiContainer } from '@parkshape/api';
import { loadConfigFromProcess } from '@parkshape/config';

import { withFixedRules } from './seed-config.js';
import { seedDemo } from './seed-demo.js';

const PGLITE_PREFIX = 'pglite://';
const JSON_INDENT = 2;
// Where the e2e specs read the seeded counts from; set by the Playwright config.
const SUMMARY_FLAG = '--summary';

function summaryPath(): string | undefined {
  const index = process.argv.indexOf(SUMMARY_FLAG);
  return index === -1 ? undefined : process.argv[index + 1];
}

/**
 * The e2e API: wipes the pglite directory, seeds it and then serves the same handler. Seeding in
 * the serving process keeps the in-memory blob store, so heightmap and thumbnails stay readable.
 * It always answers with the fixed rules, so the browser tests never reach Gemini.
 */
async function main(): Promise<void> {
  const config = withFixedRules(loadConfigFromProcess());
  if (config.DATABASE_URL.startsWith(PGLITE_PREFIX) && !config.DATABASE_URL.endsWith('memory')) {
    rmSync(config.DATABASE_URL.slice(PGLITE_PREFIX.length), { recursive: true, force: true });
  }
  const container = await createApiContainer(config);
  const app = createApp(container.deps);
  const summary = await seedDemo(app, container.deps);
  const file = summaryPath();
  if (file !== undefined) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(summary, null, JSON_INDENT)}\n`);
  }
  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    process.stdout.write(`seeded api listening on http://localhost:${String(info.port)}\n`);
  });
  process.once('SIGTERM', () => {
    server.close();
    void container.close();
  });
}

await main();
