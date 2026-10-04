import { randomBytes } from 'node:crypto';

import { expect, type APIRequestContext } from '@playwright/test';

import { defaultParameters } from '@parkshape/core';

import { STAFF } from './app-routes.ts';
import { saveBaselineFork, submitForReview } from './design-requests.ts';
import { BASELINE, SUBMITTABLE } from './editor-fixtures.ts';
import { API_URL } from './urls.ts';

const PARCEL_SIDE_M = 120;
const SUFFIX_BYTES = 3;
const ORIGIN = { lat: 49.2637, lon: -123.0972 };

export interface OwnProjectOptions {
  readonly baselineDocument?: object;
  readonly name?: string;
  readonly closesAt?: string;
}

/** A project of its own, so the designs a spec seeds never reach the other specs' queues. */
export async function createOwnProject(
  request: APIRequestContext,
  parcelId: string,
  options: OwnProjectOptions = {},
): Promise<string> {
  // A staff member's project names are unique, so each default name gets a short suffix. It stays
  // short so the name fits one line at 360 px, as the layout specs expect.
  const {
    baselineDocument = BASELINE,
    name = `E2E test ${randomBytes(SUFFIX_BYTES).toString('hex')}`,
    closesAt,
  } = options;
  const login = await request.post(`${API_URL}/auth/login`, { data: { persona: STAFF } });
  expect(login.ok()).toBe(true);
  const side = PARCEL_SIDE_M;
  const created = await request.post(`${API_URL}/projects`, {
    data: {
      name,
      parameters: defaultParameters(),
      parcel: {
        id: parcelId,
        name,
        origin: ORIGIN,
        polygon: [
          { x: 0, y: 0 },
          { x: side, y: 0 },
          { x: side, y: side },
          { x: 0, y: side },
        ],
      },
      heightmapRef: 'terrain/jonathan-rogers.bin',
      baselineDocument,
      ...(closesAt === undefined ? {} : { closesAt }),
    },
  });
  expect(created.ok()).toBe(true);
  return ((await created.json()) as { id: string }).id;
}

/** A live design by `persona`, so another resident's vote queue has one to show. */
export async function seedLiveDesign(
  request: APIRequestContext,
  projectId: string,
  persona: string,
): Promise<string> {
  await request.post(`${API_URL}/auth/login`, { data: { persona } });
  const id = await saveBaselineFork(request, projectId, {
    title: 'Garden loop',
    document: SUBMITTABLE,
  });
  await submitForReview(request, id);
  return id;
}
