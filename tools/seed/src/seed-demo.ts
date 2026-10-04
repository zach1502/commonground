import type { ApiApp, AppDeps } from '@parkshape/api';
import { SystemClock } from '@parkshape/core';
import {
  buildSeedPlan,
  loadJonathanRogersSite,
  runSeed,
  type SeedSummary,
  type ThumbnailJob,
} from '@parkshape/db/seed';

import { ApiSeedGateway } from './api-gateway.js';
import { browserThumbnails } from './thumbnails.js';

const log = {
  info: (message: string) => {
    process.stderr.write(`${message}\n`);
  },
};

/** Seeds the demo project from the Jonathan Rogers fixture through the given API handler. */
export async function seedDemo(app: ApiApp, deps: AppDeps): Promise<SeedSummary> {
  const gateway = new ApiSeedGateway({ app, deps });
  const save = (job: ThumbnailJob, image: Uint8Array) =>
    gateway.saveThumbnail(job.design.id, job.author, image);
  const summary = await runSeed({
    plan: buildSeedPlan(loadJonathanRogersSite()),
    gateway,
    thumbnails: browserThumbnails(save, log),
    clock: new SystemClock(),
  });
  const features = await gateway.warmContext(summary.projectId);
  log.info(`site context: ${String(features)} features`);
  return summary;
}
