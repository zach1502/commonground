import { z } from 'zod';

import {
  designAreaSchema,
  designItemSchema,
  designPathSchema,
  gradeCellSchema,
  itemIdSchema,
  localPointSchema,
  polygonSchema,
  zoneSchema,
} from '@parkshape/core';

const index = z.int().nonnegative();
const rotation = designItemSchema.shape.rotationDeg;

const vertexMove = { id: itemIdSchema, index, from: localPointSchema, to: localPointSchema };

/** One edit to a design, stored as data so the undo history can live in sessionStorage. */
export const singleCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('add-item'), item: designItemSchema }),
  z.strictObject({ kind: z.literal('delete-item'), item: designItemSchema, index }),
  z.strictObject({
    kind: z.literal('move-item'),
    id: itemIdSchema,
    from: localPointSchema,
    to: localPointSchema,
  }),
  z.strictObject({
    kind: z.literal('rotate-item'),
    id: itemIdSchema,
    from: rotation,
    to: rotation,
  }),
  z.strictObject({ kind: z.literal('add-path'), path: designPathSchema }),
  z.strictObject({ kind: z.literal('delete-path'), path: designPathSchema, index }),
  z.strictObject({ kind: z.literal('move-path-vertex'), ...vertexMove }),
  z.strictObject({
    kind: z.literal('insert-path-vertex'),
    id: itemIdSchema,
    index,
    point: localPointSchema,
  }),
  z.strictObject({ kind: z.literal('add-area'), area: designAreaSchema }),
  z.strictObject({ kind: z.literal('delete-area'), area: designAreaSchema, index }),
  z.strictObject({ kind: z.literal('move-area-vertex'), ...vertexMove }),
  z.strictObject({
    kind: z.literal('resize-area'),
    id: itemIdSchema,
    from: polygonSchema,
    to: polygonSchema,
  }),
  z.strictObject({ kind: z.literal('terraform'), cells: z.array(gradeCellSchema) }),
  z.strictObject({
    kind: z.literal('set-locked'),
    target: z.enum(['item', 'area']),
    id: itemIdSchema,
    locked: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('add-zone'), zone: zoneSchema }),
]);

export const batchCommandSchema = z.strictObject({
  kind: z.literal('batch'),
  commands: z.array(singleCommandSchema),
});

export const commandSpecSchema = z.union([singleCommandSchema, batchCommandSchema]);

export type SingleCommandSpec = z.infer<typeof singleCommandSchema>;
export type CommandSpec = z.infer<typeof commandSpecSchema>;
