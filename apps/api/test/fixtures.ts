import { readFileSync } from 'node:fs';

import { z } from 'zod';

import { defaultParameters, type DesignDocumentInput } from '@parkshape/core';
import { geoJsonPolygonSchema } from '@parkshape/terrain';

import { designSchema, projectSchema } from '../src/contracts/projects-designs.js';
import { thumbnailUpload } from '../src/services/thumbnail-upload.js';

import type { Harness } from './harness.js';

interface Point {
  x: number;
  y: number;
}

const rectangle = (origin: number, width: number, depth: number): [Point, Point, Point, Point] => [
  { x: origin, y: origin },
  { x: origin + width, y: origin },
  { x: origin + width, y: origin + depth },
  { x: origin, y: origin + depth },
];
const square = (origin: number, size: number) => rectangle(origin, size, size);

const RECORDED_FEATURES = new URL(
  '../../../packages/terrain/fixtures/jonathan-rogers/features.json',
  import.meta.url,
);
const recordedFeaturesSchema = z.object({
  parcel: z.object({ polygonWgs84: geoJsonPolygonSchema }),
});

/** The recorded Jonathan Rogers Park outline that the static providers serve. */
export const JONATHAN_ROGERS_OUTLINE = recordedFeaturesSchema.parse(
  JSON.parse(readFileSync(RECORDED_FEATURES, 'utf8')),
).parcel.polygonWgs84;

export const PARCEL = {
  id: 'jonathan-rogers',
  name: 'Jonathan Rogers Park',
  polygon: square(0, 120),
  origin: { lat: 49.2637, lon: -123.0972 },
};

export const BLANK: DesignDocumentInput = {
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
};

/** Meets the demo's hard garden rule: 12 m by 16 m fits 6 x 4 = 24 beds, over the 20 needed. */
export const GARDEN: DesignDocumentInput = {
  ...BLANK,
  areas: [
    {
      id: 'garden-1',
      catalogId: 'community-garden',
      polygon: rectangle(10, 12, 16),
      locked: false,
    },
  ],
};

/** Breaks the hard garden rule: 12 m by 12 m fits 6 x 3 = 18 beds, short of the 20 needed. */
export const SMALL_GARDEN: DesignDocumentInput = {
  ...BLANK,
  areas: [
    { id: 'garden-1', catalogId: 'community-garden', polygon: square(10, 12), locked: false },
  ],
};

// Each staff member's project names are unique, so each fixture project gets the next number.
let projectCount = 0;

export function projectBody(extra: Record<string, unknown> = {}) {
  projectCount += 1;
  return {
    name: `Jonathan Rogers Park refresh ${String(projectCount)}`,
    parameters: defaultParameters(),
    parcel: PARCEL,
    heightmapRef: 'terrain/jonathan-rogers.bin',
    ...extra,
  };
}

export async function createProject(h: Harness, staffCookie: string, extra = {}) {
  const response = await h.call('POST', '/projects', {
    cookie: staffCookie,
    body: projectBody(extra),
  });
  return projectSchema.parse(response.body);
}

export async function createDraft(h: Harness, cookie: string, projectId: string) {
  const response = await h.call('POST', `/projects/${projectId}/designs`, {
    cookie,
    body: { from: 'blank', title: 'Garden corner' },
  });
  return designSchema.parse(response.body);
}

/** A draft saved with the given document, then submitted; returns the raw submit response. */
export async function submitDocument(
  h: Harness,
  cookie: string,
  projectId: string,
  document: DesignDocumentInput,
) {
  const draft = await createDraft(h, cookie, projectId);
  await h.call('PUT', `/designs/${draft.id}`, {
    cookie,
    body: { title: 'Garden corner', blurb: 'Beds by the lane.', document },
  });
  return h.call('POST', `/designs/${draft.id}/submit`, { cookie });
}

/** A draft saved with the garden document and submitted; returns the now-submitted design. */
export async function submitGarden(h: Harness, cookie: string, projectId: string) {
  const draft = await createDraft(h, cookie, projectId);
  await h.call('PUT', `/designs/${draft.id}`, {
    cookie,
    body: { title: 'Garden corner', blurb: 'Beds by the lane.', document: GARDEN },
  });
  await h.call('POST', `/designs/${draft.id}/submit`, { cookie });
  return designSchema.parse((await h.call('GET', `/designs/${draft.id}`, { cookie })).body);
}

/** The blob route path a thumbnail upload of these bytes is stored under for this design. */
export function thumbnailPath(designId: string, imageBase64: string): string {
  return `/blobs/${thumbnailUpload(designId, imageBase64).key}`;
}
