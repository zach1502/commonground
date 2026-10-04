import { afterAll, describe, expect, it } from 'vitest';

import { catalogIndex, computeMetrics, designDocumentSchema } from '@parkshape/core';
import { loadJonathanRogersSite } from '@parkshape/db/seed';

import type { MetricsJob, MetricsRunner } from '../metrics-runner.js';

const site = loadJonathanRogersSite();
const CONCURRENT_JOBS = 6;

// The recorded park plus a gravel path across it, so path slopes read the real terrain.
const WITH_PATH = designDocumentSchema.parse({
  ...site.baseline,
  paths: [
    ...site.baseline.paths,
    {
      id: 'contract-path',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 20, y: 40 },
        { x: 150, y: 40 },
      ],
    },
  ],
});

/** The recorded park: 22 trees and the 56-plot garden on real terrain, with one new path. */
export const FIXTURE_JOB: MetricsJob = {
  document: WITH_PATH,
  baseline: site.baseline,
  parameters: site.parameters,
  parcel: site.parcel,
  heightmap: site.heightmap,
  heightmapKey: site.heightmapRef,
};

const UNKNOWN_ITEM = designDocumentSchema.parse({
  ...site.baseline,
  items: [
    {
      id: 'tub-1',
      catalogId: 'hot-tub',
      position: { x: 10, y: 10 },
      rotationDeg: 0,
      locked: false,
    },
  ],
});

function expectedReport() {
  const result = computeMetrics({ ...FIXTURE_JOB, catalog: catalogIndex });
  if (!result.ok) throw new Error('the fixture design must be measurable');
  return result.value;
}

function expectedIssues() {
  const result = computeMetrics({ ...FIXTURE_JOB, document: UNKNOWN_ITEM, catalog: catalogIndex });
  if (result.ok) throw new Error('the hot tub must not be measurable');
  return result.error.issues;
}

/** Behaviour every MetricsRunner adapter must have. Each adapter test calls this with a factory. */
export function metricsRunnerContract(name: string, makeRunner: () => MetricsRunner): void {
  describe(`${name} meets the MetricsRunner contract`, () => {
    const runners: MetricsRunner[] = [];
    const runner = () => {
      const made = makeRunner();
      runners.push(made);
      return made;
    };

    afterAll(async () => {
      await Promise.all(runners.map((made) => made.close()));
    });

    it('gives the same report as computeMetrics for the fixture design', async () => {
      const outcome = await runner().measure(FIXTURE_JOB);
      expect(outcome.kind).toBe('measured');
      const expected = expectedReport();
      if (outcome.kind !== 'measured') return;
      expect(outcome.report).toEqual(expected);
      expect(JSON.stringify(outcome.report.totals)).toBe(JSON.stringify(expected.totals));
    });

    it('gives the same report again when the heightmap key repeats', async () => {
      const made = runner();
      const first = await made.measure(FIXTURE_JOB);
      const second = await made.measure(FIXTURE_JOB);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });

    it('answers every job when more arrive at once than it has threads', async () => {
      const made = runner();
      const outcomes = await Promise.all(
        Array.from({ length: CONCURRENT_JOBS }, () => made.measure(FIXTURE_JOB)),
      );
      const totals = JSON.stringify(expectedReport().totals);
      for (const outcome of outcomes) {
        expect(outcome.kind === 'measured' && JSON.stringify(outcome.report.totals)).toBe(totals);
      }
    });

    it('returns the document issues for a design core cannot measure', async () => {
      const outcome = await runner().measure({ ...FIXTURE_JOB, document: UNKNOWN_ITEM });
      expect(expectedIssues()).not.toHaveLength(0);
      expect(outcome).toEqual({ kind: 'invalid', issues: expectedIssues() });
    });
  });
}
