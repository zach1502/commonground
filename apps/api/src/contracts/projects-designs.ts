import { z } from '@hono/zod-openapi';

import {
  MAX_DESCRIPTION_CHARS,
  closesAtSchema,
  constraintKeySchema,
  designDocumentSchema,
  parcelSchema,
  projectParametersSchema,
  projectPhaseSchema,
  projectStatusSchema,
  zoneSchema,
} from '@parkshape/core';

import { authorSchema, isoDateSchema, metricsSchema } from './common.js';

const MAX_NAME_LENGTH = 120;
const MAX_TITLE_LENGTH = 80;
const MAX_BLURB_LENGTH = 500;
// Layout seeds are unsigned 32-bit, as the seeded Random takes them.
const MAX_SEED = 0xffff_ffff;

// Core schemas are built before @hono/zod-openapi extends zod, so they are named with zod's own
// .meta({ id }) instead of .openapi(); the generator reads both.
export const designDocumentContract = designDocumentSchema.meta({ id: 'DesignDocument' });
const parametersContract = projectParametersSchema.meta({ id: 'ProjectParameters' });
const parcelContract = parcelSchema.meta({ id: 'Parcel' });
const zoneContract = zoneSchema.meta({ id: 'Zone' });
const closesAtContract = closesAtSchema.meta({
  description: 'Last day of design and voting in Vancouver time, as an ISO date.',
  example: '2026-10-31',
});

export const projectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: projectStatusSchema,
    parameters: parametersContract,
    parcel: parcelContract,
    heightmapRef: z.string(),
    baselineDesignId: z.string().nullable(),
    closesAt: closesAtContract.nullable(),
    phase: projectPhaseSchema.meta({
      description: 'closed when staff closed the project or its closing day has passed.',
    }),
    createdAt: isoDateSchema,
  })
  .openapi('Project');

export const projectTerrainSchema = z
  .object({
    source: z.enum(['stored', 'flat']).meta({
      description: 'flat when the project has no stored heightmap yet.',
    }),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    resolutionM: z.number().positive(),
    originLocal: z.object({ x: z.number(), y: z.number() }),
    elevations: z.string().meta({
      description: 'Elevations in metres as base64 float32 little-endian, south row first.',
    }),
  })
  .openapi('ProjectTerrain', { description: 'The ground the 3D views draw and metrics use.' });

export const createProjectBodySchema = z
  .object({
    name: z.string().min(1).max(MAX_NAME_LENGTH),
    parameters: parametersContract,
    parcel: parcelContract,
    heightmapRef: z.string().min(1),
    baselineDocument: designDocumentContract.optional(),
    closesAt: closesAtContract.nullable().optional(),
    zones: z
      .array(zoneContract)
      .optional()
      .openapi({ description: 'Zones drawn in setup; added to parameters.forbiddenZones.' }),
  })
  .openapi('CreateProjectBody');

export const projectStatusBodySchema = z
  .object({
    status: projectStatusSchema,
    closesAt: closesAtContract
      .nullable()
      .optional()
      .meta({ description: 'A new closing day; null clears it, and leaving it out keeps it.' }),
  })
  .openapi('ProjectStatusBody');

export const designStatusSchema = z.enum(['draft', 'submitted', 'superseded']);

export const softWarningSchema = z
  .object({
    key: constraintKeySchema,
    message: z.string(),
    badge: z.string(),
  })
  .openapi('SoftWarning', { description: 'A missed soft constraint, shown as a badge.' });

export const hardFailureSchema = z
  .object({ key: constraintKeySchema, message: z.string() })
  .openapi('HardFailure', { description: 'A broken hard constraint that blocks submitting.' });

export const designSummarySchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    title: z.string(),
    blurb: z.string(),
    status: designStatusSchema,
    metrics: metricsSchema.nullable(),
    forkedFrom: z.string().nullable(),
    versionOf: z.string().nullable(),
    thumbnailRef: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    badges: z.array(softWarningSchema),
    up: z.number().int(),
    down: z.number().int(),
    createdAt: isoDateSchema,
    submittedAt: isoDateSchema.nullable(),
    author: authorSchema,
  })
  .openapi('DesignSummary');

export const designLineageSchema = z
  .object({
    forkedFrom: z.string().nullable(),
    versionOf: z.string().nullable(),
    supersededBy: z.string().nullable(),
  })
  .openapi('DesignLineage', { description: 'Where a design came from and what replaced it.' });

export const designSchema = designSummarySchema
  .extend({
    document: designDocumentContract,
    lineage: designLineageSchema,
    updatedAt: isoDateSchema.openapi({
      description:
        'The server stamp of the last save. Send it back as expectedUpdatedAt; compare it only for equality.',
    }),
  })
  .openapi('Design');

export const draftChangedSchema = z
  .object({
    code: z.literal('draftChanged'),
    error: z.object({
      kind: z.literal('draftChanged'),
      message: z.string(),
      requestId: z.string(),
    }),
    current: designSchema,
  })
  .openapi('DraftChanged', {
    description: 'Someone saved this draft after the stamp the caller sent; current is that save.',
  });

export const submitResultSchema = z
  .object({
    status: designStatusSchema,
    metrics: metricsSchema,
    hardFailures: z.array(hardFailureSchema),
    softWarnings: z.array(softWarningSchema),
    thumbnailPending: z.boolean().openapi({
      description:
        'True while the design has no stored thumbnail. Upload one with POST /designs/{id}/thumbnail, and retry after Retry-After if it answers 503.',
    }),
  })
  .openapi('SubmitResult');

export const thumbnailBodySchema = z
  .object({
    image: z.string().min(1).openapi({
      description: 'Base64-encoded WebP, or PNG where WebP is not supported; 500 KB at most.',
    }),
  })
  .openapi('ThumbnailBody');

export const createDesignBodySchema = z
  .object({
    from: z.enum(['blank', 'fork', 'baseline', 'describe']),
    sourceDesignId: z
      .string()
      .min(1)
      .optional()
      .openapi({ description: 'The submitted design to fork; required when from is fork.' }),
    title: z.string().min(1).max(MAX_TITLE_LENGTH).optional(),
    text: z
      .string()
      .trim()
      .min(1)
      .max(MAX_DESCRIPTION_CHARS)
      .optional()
      .openapi({ description: 'What the park should have; required when from is describe.' }),
    seed: z.int().min(0).max(MAX_SEED).optional().openapi({
      description: 'Layout seed for describe; the same text and seed give the same draft.',
    }),
  })
  .openapi('CreateDesignBody');

export const saveDraftBodySchema = z
  .object({
    title: z.string().min(1).max(MAX_TITLE_LENGTH),
    blurb: z.string().max(MAX_BLURB_LENGTH),
    document: designDocumentContract,
    expectedUpdatedAt: isoDateSchema.optional().openapi({
      description:
        'The updatedAt the caller last read. When it no longer matches, nothing is saved and the answer is 409 DraftChanged.',
    }),
  })
  .openapi('SaveDraftBody');

export const designListSchema = z
  .object({ designs: z.array(designSummarySchema) })
  .openapi('DesignList');

export const projectListSchema = z
  .object({ projects: z.array(projectSchema) })
  .openapi('ProjectList');
