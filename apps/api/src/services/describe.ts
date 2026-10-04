import type { z } from '@hono/zod-openapi';

import { sourceOf } from '@parkshape/ai';
import {
  catalogIndex,
  createSeededRandom,
  designDocumentSchema,
  solveLayout,
  type DesignDocument,
} from '@parkshape/core';
import type { Project } from '@parkshape/db';

import type { createDesignBodySchema } from '../contracts/projects-designs.js';
import type { AppDeps } from '../deps.js';
import { ApiError, featureOff } from '../errors.js';
import { loadProjectTerrain } from '../rules/index.js';

import { loadDesign, storedDocument, storedParameters, storedParcel } from './access.js';

type CreateDesignBody = z.infer<typeof createDesignBodySchema>;

const EMPTY_DOCUMENT: DesignDocument = designDocumentSchema.parse({
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
});

async function baselineOf(deps: AppDeps, project: Project): Promise<DesignDocument> {
  if (project.baselineDesignId === null) return EMPTY_DOCUMENT;
  return storedDocument(await loadDesign(deps.repos, project.baselineDesignId));
}

/**
 * A draft laid out from a description: the intent provider reads the text, then the layout
 * solver places it on the project's terrain. The intent, seed and notes go in the document.
 */
export async function describedDocument(
  deps: AppDeps,
  project: Project,
  body: CreateDesignBody,
): Promise<DesignDocument> {
  if (!deps.config.FEATURE_DESCRIBE_IT) throw featureOff('Describe it');
  if (body.text === undefined) throw new ApiError('validation', 'Give text to describe a design.');
  const answer = await deps.ai.intent.parse(body.text);
  const intent = answer.value;
  const seed = body.seed ?? deps.layoutSeed();
  const parcel = storedParcel(project);
  const baseline = await baselineOf(deps, project);
  const { heightmap } = await loadProjectTerrain(deps.blobStore, project, parcel);
  const solved = solveLayout({
    intent,
    parcel,
    heightmap,
    parameters: storedParameters(project),
    catalog: catalogIndex,
    baseline,
    zones: baseline.zones,
    random: createSeededRandom(seed),
  });
  if (!solved.ok) {
    throw new ApiError(
      'site-data-unavailable',
      'The terrain does not cover the park, so no layout was made.',
    );
  }
  const { document, notes } = solved.value;
  // Who read the text goes with the draft, so the preview can say whether a model did.
  return { ...document, generated: { intent, seed, notes: [...notes], ...sourceOf(answer) } };
}
