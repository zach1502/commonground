import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { catalogIndex } from '@parkshape/core';

import { designSchema } from '../src/contracts/projects-designs.js';

import { GARDEN, createProject } from './fixtures.js';
import { BOB, STAFF, errorKind, startHarness, type Harness } from './harness.js';

const DOG_PARK =
  'a dog park in the back corner, a pond on the low side, a loop path, lots of trees';

let h: Harness;
let staff: string;
let bob: string;
let projectId: string;

beforeAll(async () => {
  h = await startHarness();
  staff = await h.login(STAFF);
  bob = await h.login(BOB);
  projectId = (await createProject(h, staff)).id;
});

afterAll(async () => {
  await h.close();
});

async function describeDesign(body: Record<string, unknown>) {
  return h.call('POST', `/projects/${projectId}/designs`, {
    cookie: bob,
    body: { from: 'describe', ...body },
  });
}

function categoriesOf(design: ReturnType<typeof designSchema.parse>) {
  const { items, areas } = design.document;
  return [...items, ...areas].map((element) => catalogIndex.get(element.catalogId)?.category);
}

// Each draft runs the layout solver on the 120 m demo parcel, which is slow under coverage.
describe('POST /projects/:id/designs from a description', { timeout: 60_000 }, () => {
  it('turns the demo sentence into a draft with a dog area, a pond, a loop and trees', async () => {
    const response = await describeDesign({ text: DOG_PARK, seed: 42 });
    expect(response.status).toBe(201);
    const design = designSchema.parse(response.body);
    expect(design.status).toBe('draft');
    const categories = categoriesOf(design);
    expect(categories).toContain('dog');
    expect(categories).toContain('water');
    expect(categories.filter((category) => category === 'tree').length).toBeGreaterThan(0);
    expect(design.document.paths).toHaveLength(1);
    const loop = design.document.paths[0]?.points ?? [];
    expect(loop[0]).toEqual(loop.at(-1));
    expect(design.document.gradeDelta.cells).toEqual([]);
    expect(design.document.generated).toMatchObject({
      seed: 42,
      intent: { paths: { style: 'loop' } },
      source: 'rule-based',
    });
    expect(design.document.generated).not.toHaveProperty('model');
    expect(Array.isArray(design.document.generated?.notes)).toBe(true);
  });

  it('starts from the project baseline, so the existing garden survives', async () => {
    const withGarden = await createProject(h, staff, { baselineDocument: GARDEN });
    const response = await h.call('POST', `/projects/${withGarden.id}/designs`, {
      cookie: bob,
      body: { from: 'describe', text: DOG_PARK, seed: 42 },
    });
    expect(response.status).toBe(201);
    const design = designSchema.parse(response.body);
    expect(design.document.areas).toContainEqual(GARDEN.areas[0]);
    expect(categoriesOf(design)).toContain('dog');
  });

  it('gives the same layout for the same seed and a new one for another seed', async () => {
    const first = designSchema.parse((await describeDesign({ text: DOG_PARK, seed: 1 })).body);
    const again = designSchema.parse((await describeDesign({ text: DOG_PARK, seed: 1 })).body);
    const other = designSchema.parse((await describeDesign({ text: DOG_PARK, seed: 2 })).body);
    expect(again.document).toEqual(first.document);
    expect(other.document.items).not.toEqual(first.document.items);
  });

  it('picks a new seed for each draft when none is given', async () => {
    const first = designSchema.parse((await describeDesign({ text: DOG_PARK })).body);
    const second = designSchema.parse((await describeDesign({ text: DOG_PARK })).body);
    expect(second.document.generated?.seed).not.toBe(first.document.generated?.seed);
  });

  it('asks for the text and keeps it within 400 characters', async () => {
    expect((await describeDesign({})).status).toBe(400);
    expect((await describeDesign({ text: 'x'.repeat(401) })).status).toBe(400);
  });
});

describe('POST /projects/:id/designs from a description with the flag off', () => {
  let off: Harness;

  // The second harness starts in the hook too, where vitest.config.ts gives pglite its budget.
  beforeAll(async () => {
    off = await startHarness({ FEATURE_DESCRIBE_IT: 'false' });
  });

  afterAll(async () => {
    await off.close();
  });

  it('answers 503 feature-off', async () => {
    const staffOff = await off.login(STAFF);
    const residentOff = await off.login(BOB);
    const project = await createProject(off, staffOff);
    const response = await off.call('POST', `/projects/${project.id}/designs`, {
      cookie: residentOff,
      body: { from: 'describe', text: DOG_PARK },
    });
    expect(response.status).toBe(503);
    expect(errorKind(response.body)).toBe('feature-off');
    const blank = await off.call('POST', `/projects/${project.id}/designs`, {
      cookie: residentOff,
      body: { from: 'blank' },
    });
    expect(blank.status).toBe(201);
  });
});
