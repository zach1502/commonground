import { z } from 'zod';

import { scalePolicySchema } from '@parkshape/core';

export const CC0 = 'CC0-1.0' as const;
export const PLACEHOLDER_SOURCE = 'procedural placeholder';

const licenceSchema = z.literal(CC0);
const sourceRefSchema = z.strictObject({
  name: z.string().min(1),
  url: z.string().min(1),
  author: z.string().min(1),
});

/** A site or author credited in the UI attribution. */
export const creditSchema = sourceRefSchema.extend({ licence: licenceSchema });

/** Where one model comes from: an entry in a cached zip, a direct GLB URL, or a procedural build. */
export const sourceModelSchema = z.strictObject({
  modelKey: z.string().min(1),
  category: z.string().min(1),
  source: creditSchema,
  file: z.string().min(1),
  // Turns the source about y before fitting, for models authored along the other axis.
  yawDeg: z.number().default(0),
});

/** 'detail' becomes a light greyscale map that multiplies a tint; 'normal' stays a normal map. */
export const textureKindSchema = z.enum(['detail', 'normal']);

/** One 512 px surface map under apps/web/public/textures, made from an ambientCG 1K pack. */
export const sourceTextureSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9-]+$/),
  /** The ambientCG asset id, such as Grass004. */
  asset: z.string().min(1),
  /** Which map of the pack: Color or NormalGL. */
  map: z.enum(['Color', 'NormalGL']),
  kind: textureKindSchema,
  source: creditSchema,
});

export const sourceManifestSchema = z
  .strictObject({
    sources: z.array(creditSchema).min(1),
    models: z.array(sourceModelSchema),
  })
  .superRefine((manifest, ctx) => {
    const names = new Set(manifest.sources.map((source) => source.name));
    manifest.models.forEach((model, index) => {
      if (!names.has(model.source.name)) {
        ctx.addIssue({
          code: 'custom',
          message: `source "${model.source.name}" is not in the sources list`,
          path: ['models', index, 'source', 'name'],
        });
      }
    });
  });

/** textures.json: the surface maps, kept apart from manifest.json to hold each under its budget. */
export const textureManifestSchema = z.strictObject({
  textures: z.array(sourceTextureSchema),
});

export type SourceModel = z.infer<typeof sourceModelSchema>;
export type SourceManifest = z.infer<typeof sourceManifestSchema>;
export type SourceTexture = z.infer<typeof sourceTextureSchema>;
export type TextureKind = z.infer<typeof textureKindSchema>;

const metresSchema = z.number().nonnegative();

export const fittedAxisSchema = z.enum(['widthM', 'depthM', 'heightM']);

/** One processed GLB under apps/web/public/models. */
export const modelEntrySchema = z
  .strictObject({
    modelKey: z.string().min(1),
    file: z.string().regex(/^models\/[a-z0-9-]+\.glb$/),
    dims: z.strictObject({ widthM: metresSchema, depthM: metresSchema, heightM: metresSchema }),
    fittedAxis: fittedAxisSchema,
    triangles: z.strictObject({ before: z.int().nonnegative(), after: z.int().nonnegative() }),
    bytes: z.int().positive(),
    scalePolicy: scalePolicySchema,
    licence: licenceSchema,
    source: sourceRefSchema,
  })
  .refine((entry) => entry.triangles.after <= entry.triangles.before, {
    message: 'Processing never adds triangles',
    path: ['triangles', 'after'],
  });

export const modelsManifestSchema = z.strictObject({
  note: z.string(),
  models: z.array(modelEntrySchema),
});

export type FittedAxis = z.infer<typeof fittedAxisSchema>;
export type ModelEntry = z.infer<typeof modelEntrySchema>;
