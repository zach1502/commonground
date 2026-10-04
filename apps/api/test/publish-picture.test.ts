import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { designSchema } from '../src/contracts/projects-designs.js';

import { BLANK, createProject, thumbnailPath } from './fixtures.js';
import { MOLLY, STAFF, errorKind, startHarness, type Harness } from './harness.js';

let h: Harness;
let staff: string;
let molly: string;

// A 1x1 PNG, the smallest picture the thumbnail route takes.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

beforeAll(async () => {
  h = await startHarness();
  staff = await h.login(STAFF);
  molly = await h.login(MOLLY);
});

afterAll(async () => {
  await h.close();
});

async function baselineOf(projectId: string) {
  const response = await h.call('GET', `/projects/${projectId}/baseline`, { cookie: molly });
  return designSchema.parse(response.body);
}

// The publish step draws the park today in the planner's browser with the seed's offline preset,
// then stores it on the baseline design, the same route the seed's thumbnail step calls.
describe('publishing a project stores its baseline picture', () => {
  it('has no picture until the publish step stores one, then the project page gets its URL', async () => {
    const project = await createProject(h, staff, { baselineDocument: BLANK });
    const id = project.baselineDesignId ?? '';
    expect((await baselineOf(project.id)).thumbnailUrl).toBeNull();
    const stored = await h.call('POST', `/designs/${id}/thumbnail`, {
      cookie: staff,
      body: { image: PNG_1X1 },
    });
    expect(stored.status).toBe(200);
    const baseline = await baselineOf(project.id);
    const path = thumbnailPath(id, PNG_1X1);
    expect(baseline.thumbnailUrl?.endsWith(path)).toBe(true);
    const picture = await h.deps.blobStore.get(path.replace('/blobs/', ''));
    expect(picture?.contentType).toBe('image/png');
  });

  it('lets only the planner who published it store the picture', async () => {
    const project = await createProject(h, staff, { baselineDocument: BLANK });
    const response = await h.call('POST', `/designs/${project.baselineDesignId ?? ''}/thumbnail`, {
      cookie: molly,
      body: { image: PNG_1X1 },
    });
    expect(errorKind(response.body)).toBe('forbidden');
  });
});
