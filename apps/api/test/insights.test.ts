import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CONSTRAINT_KEYS,
  CSV_HEADER,
  INSIGHTS_CACHE_MS,
  MAX_LIVE_SUBMISSIONS,
  type DesignDocumentInput,
} from '@parkshape/core';

import { insightsSchema } from '../src/contracts/insights.js';

import { BLANK, createProject } from './fixtures.js';
import { BOB, STAFF, errorKind, startHarness, type Harness } from './harness.js';

let h: Harness;
let staff: string;

beforeAll(async () => {
  h = await startHarness();
  staff = await h.login(STAFF);
});

afterAll(async () => {
  await h.close();
});

const TREE_DESIGN: DesignDocumentInput = {
  ...BLANK,
  items: [
    {
      id: 'oak-1',
      catalogId: 'garry-oak',
      position: { x: 20, y: 20 },
      rotationDeg: 0,
      locked: false,
    },
  ],
  paths: [
    {
      id: 'path-1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 5, y: 50 },
        { x: 100, y: 50 },
      ],
    },
  ],
  gradeDelta: { cells: [{ x: 30, y: 30, deltaM: 0.4 }] },
};

function storedMetrics(netM3: number, budget: 'ok' | 'warn' | 'fail') {
  const constraint = (status: string) => ({ status, severity: 'soft', value: 0, message: 'x' });
  return {
    heightmapSource: 'flat',
    constraints: {
      ...Object.fromEntries(CONSTRAINT_KEYS.map((key) => [key, constraint('ok')])),
      budget: constraint(budget),
      canopy: constraint('warn'),
    },
    totals: {
      costCad: 1000,
      canopyPercent: 10,
      imperviousPercent: 5,
      waterPercent: 0,
      cut: 0,
      fill: 0,
      net: netM3,
      truckTrips: 0,
      disturbedPercent: 0,
      gardenPlots: 0,
    },
    isSubmittable: true,
  };
}

const AUTHORS = ['author-a', 'author-b', 'author-c'];
const VOTERS = ['voter-1', 'voter-2', 'voter-3', 'voter-4', 'voter-5', 'voter-6'];
const NETS = [-20, 30, 170];

async function seedPeople() {
  const { users } = h.deps.repos;
  for (const id of [...AUTHORS, ...VOTERS]) {
    await users.upsert({ id, role: 'resident', displayName: id });
    await users.setSelfReport(id, { fsa: 'V5T', ageBand: '30-44' });
  }
}

async function seedDesign(projectId: string, index: number) {
  const { designs } = h.deps.repos;
  const draft = await designs.create({
    projectId,
    authorId: AUTHORS[index] ?? '',
    title: `Design ${String(index + 1)}`,
    blurb: '',
    document: index === 0 ? TREE_DESIGN : BLANK,
    forkedFrom: null,
  });
  const submitted = await designs.submit(draft.id, {
    metrics: storedMetrics(NETS[index] ?? 0, index === 2 ? 'fail' : 'ok'),
    document: draft.document,
    liveCap: MAX_LIVE_SUBMISSIONS,
  });
  return submitted.kind === 'submitted' ? submitted.design.id : '';
}

/** Three live designs, six voters with reasons and self reports, seeded through repositories. */
async function seededProject() {
  const project = await createProject(h, staff);
  await seedPeople();
  const designs = [];
  for (const index of AUTHORS.keys()) designs.push(await seedDesign(project.id, index));
  const [first = '', second = ''] = designs;
  const { votes } = h.deps.repos;
  for (const userId of VOTERS) {
    await votes.upsertVote({ userId, designId: first, value: 1, reasons: ['trees', 'paths'] });
  }
  await votes.upsertVote({
    userId: 'voter-1',
    designId: second,
    value: -1,
    reasons: ['too-expensive'],
  });
  return { project, designs };
}

describe('GET /projects/:id/insights', () => {
  it('is for staff only', async () => {
    const { project } = await seededProject();
    const anonymous = await h.call('GET', `/projects/${project.id}/insights`);
    expect(anonymous.status).toBe(401);
    const resident = await h.call('GET', `/projects/${project.id}/insights`, {
      cookie: await h.login(BOB),
    });
    expect(resident.status).toBe(403);
    expect(errorKind(resident.body)).toBe('forbidden');
  });

  it('computes every aggregate from the repositories', async () => {
    const { project } = await seededProject();
    const response = await h.call('GET', `/projects/${project.id}/insights`, { cookie: staff });
    expect(response.status).toBe(200);
    const insights = insightsSchema.parse(response.body);
    expect(insights.headline).toEqual({ designsSubmitted: 3, uniqueVoters: 6, votesCast: 7 });
    const trees = insights.features.find((row) => row.category === 'tree');
    expect(trees?.designsWithPercent).toBeCloseTo(100 / 3);
    const treeMap = insights.heatmaps.find((map) => map.category === 'tree');
    expect(treeMap).toMatchObject({ width: 120, height: 120, cellM: 1 });
    expect(Math.max(...(treeMap?.values ?? []))).toBeCloseTo(0.333);
    const regrade = insights.heatmaps.find((map) => map.category === 'regrade');
    expect(regrade?.values[30 * 120 + 30]).toBeCloseTo(0.333);
    expect(insights.compliance.find((row) => row.key === 'budget')).toEqual({
      key: 'budget',
      ok: 2,
      warn: 0,
      fail: 1,
    });
    expect(insights.earthworks.bins.map((bin) => bin.count)).toEqual([1, 1, 0, 0, 1]);
    expect(insights.reasons.overall.find((row) => row.reason === 'trees')?.count).toBe(6);
    expect(insights.reasons.up.find((row) => row.reason === 'trees')?.count).toBe(6);
    expect(insights.reasons.down.find((row) => row.reason === 'too-expensive')?.count).toBe(1);
    expect(insights.reasons.down.find((row) => row.reason === 'trees')?.count).toBe(0);
    // Nine people share one FSA and age band; nobody is left unanswered.
    expect(insights.engagement.byFsa).toEqual([
      { group: 'V5T', count: 9, suppressed: false },
      { group: null, count: null, suppressed: true },
    ]);
  });
});

describe('GET /projects/:id/insights with a baseline and a cache', () => {
  it('diffs designs against the baseline when the project has one', async () => {
    const project = await createProject(h, staff, { baselineDocument: TREE_DESIGN });
    const response = await h.call('GET', `/projects/${project.id}/insights`, { cookie: staff });
    const insights = insightsSchema.parse(response.body);
    expect(insights.baselineDiff.map((row) => row.featureId)).toEqual(['oak-1', 'path-1']);
  });

  it('reuses the result for 5 seconds, then recomputes', async () => {
    const { project, designs } = await seededProject();
    const path = `/projects/${project.id}/insights`;
    const headline = async () =>
      insightsSchema.parse((await h.call('GET', path, { cookie: staff })).body).headline;
    expect((await headline()).votesCast).toBe(7);
    await h.deps.repos.votes.upsertVote({
      userId: 'author-a',
      designId: designs[1] ?? '',
      value: 1,
      reasons: [],
    });
    expect((await headline()).votesCast).toBe(7);
    h.clock.advance(INSIGHTS_CACHE_MS + 1);
    expect((await headline()).votesCast).toBe(8);
  });

  it('answers 404 for an unknown project', async () => {
    const response = await h.call('GET', '/projects/nope/insights', { cookie: staff });
    expect(response.status).toBe(404);
  });
});

async function download(path: string, as: 'staff' | 'anonymous' = 'staff') {
  const response = await h.app.request(path, as === 'staff' ? { headers: { Cookie: staff } } : {});
  return { response, text: await response.text() };
}

describe('GET /projects/:id/insights/export.*', () => {
  it('streams the top designs as CSV in leaderboard order', async () => {
    const { project, designs } = await seededProject();
    const { response, text } = await download(`/projects/${project.id}/insights/export.csv?n=2`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="parkshape-${project.id}-top-2.csv"`,
    );
    const lines = text.trimEnd().split('\r\n');
    expect(lines[0]).toBe(CSV_HEADER.join(','));
    expect(lines).toHaveLength(3);
    expect(lines[1]?.startsWith(`1,${designs[0] ?? ''},Design 1,`)).toBe(true);
  });

  it('defaults to the top 10 and writes GeoJSON features', async () => {
    const { project } = await seededProject();
    const { response, text } = await download(`/projects/${project.id}/insights/export.geojson`);
    expect(response.headers.get('Content-Type')).toContain('application/geo+json');
    expect(response.headers.get('Content-Disposition')).toContain('top-10.geojson');
    const collection = JSON.parse(text) as { features: { properties: { rank: number } }[] };
    expect(collection.features.map((feature) => feature.properties.rank)).toEqual([1, 1]);
  });

  it('writes a DXF drawing', async () => {
    const { project } = await seededProject();
    const { response, text } = await download(`/projects/${project.id}/insights/export.dxf?n=1`);
    expect(response.headers.get('Content-Type')).toContain('application/dxf');
    expect(text).toContain('R01-TREE');
    expect(text.endsWith('EOF\r\n')).toBe(true);
  });

  it('is for staff only and checks n', async () => {
    const { project } = await seededProject();
    const anonymous = await download(`/projects/${project.id}/insights/export.csv`, 'anonymous');
    expect(anonymous.response.status).toBe(401);
    const bad = await download(`/projects/${project.id}/insights/export.csv?n=0`);
    expect(bad.response.status).toBe(400);
  });
});
