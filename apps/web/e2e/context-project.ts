import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, type APIRequestContext } from '@playwright/test';

import { defaultParameters } from '@parkshape/core';

import { STAFF } from './app-routes.ts';
import { BASELINE } from './editor-fixtures.ts';
import { API_URL } from './urls.ts';

const FIXTURES = '../../../packages/terrain/fixtures/jonathan-rogers';
// The recorded parcel, so the static context fixture covers the project.
const RECORDED = JSON.parse(
  readFileSync(new URL(`${FIXTURES}/features.json`, import.meta.url), 'utf8'),
) as { parcel: { polygonLocal: unknown; origin: unknown } };
const SUFFIX_BYTES = 2;

interface RecordedStop {
  readonly kind: string;
  readonly geometry: { readonly type: string; readonly position?: { x: number; y: number } };
}

/** The recorded bus stops, in the parcel's local frame. */
export const RECORDED_BUS_STOPS = (
  JSON.parse(readFileSync(new URL(`${FIXTURES}/context.json`, import.meta.url), 'utf8')) as {
    context: { features: readonly RecordedStop[] };
  }
).context.features.flatMap((feature) =>
  feature.kind === 'busStop' && feature.geometry.position !== undefined
    ? [feature.geometry.position]
    : [],
);

/** A staff project on the recorded Jonathan Rogers parcel; returns its id. */
export async function createRecordedProject(request: APIRequestContext): Promise<string> {
  await request.post(`${API_URL}/auth/login`, { data: { persona: STAFF } });
  // Staff project names are unique, and a retry runs this again in a new worker.
  const name = `Context check ${randomBytes(SUFFIX_BYTES).toString('hex')}`;
  const created = await request.post(`${API_URL}/projects`, {
    data: {
      name,
      parameters: defaultParameters(),
      parcel: {
        id: 'jonathan-rogers',
        name,
        polygon: RECORDED.parcel.polygonLocal,
        origin: RECORDED.parcel.origin,
      },
      heightmapRef: 'terrain/jonathan-rogers.bin',
      baselineDocument: BASELINE,
    },
  });
  expect(created.ok()).toBe(true);
  return ((await created.json()) as { id: string }).id;
}
