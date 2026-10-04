import { z } from 'zod';

import { catalogIdSchema, slugSchema } from './ids.js';
import { cadSchema, positiveMetresSchema, slopeSchema, squareMetresSchema } from './units.js';

export const geometryKindSchema = z.enum(['point', 'linear', 'area']);
/** How a model fills its footprint: one fixed mesh, repeated tiles, or path segments. */
export const scalePolicySchema = z.enum(['fixed', 'tile', 'segment']);
export const severitySchema = z.enum(['soft', 'hard']);
export const pathSurfaceSchema = z.enum(['asphalt', 'gravel', 'boardwalk']);
export const projectStatusSchema = z.enum(['open', 'closed']);
/** Which ground cover an item counts as when computing impervious and water share. */
export const surfaceSchema = z.enum(['pervious', 'impervious', 'water']);
export const categorySchema = z.enum([
  'tree',
  'shrub',
  'path',
  'water',
  'play',
  'seating',
  'sports',
  'garden',
  'dog',
  'lighting',
  'washroom',
  'parking',
  'ground',
  'plaza',
  'amenity',
]);
export const moduleKindSchema = z.enum(['raised-bed']);

export type GeometryKind = z.infer<typeof geometryKindSchema>;
export type ScalePolicy = z.infer<typeof scalePolicySchema>;
export type Severity = z.infer<typeof severitySchema>;
export type PathSurface = z.infer<typeof pathSurfaceSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type Surface = z.infer<typeof surfaceSchema>;
export type Category = z.infer<typeof categorySchema>;

const unitCostSchema = z
  .strictObject({
    perItemCad: cadSchema.optional(),
    perM2Cad: cadSchema.optional(),
    perModuleCad: cadSchema.optional(),
  })
  .refine((cost) => Object.values(cost).some((amount) => amount !== undefined), {
    message: 'Give at least one unit cost',
  });

/** One repeated unit inside an area, such as a raised bed with its share of aisle. */
export const areaModuleSchema = z.strictObject({
  kind: moduleKindSchema,
  widthM: positiveMetresSchema,
  depthM: positiveMetresSchema,
  aisleM: positiveMetresSchema,
});

export const perimeterSchema = z.strictObject({
  postSpacingM: positiveMetresSchema,
  gateCount: z.union([z.literal(0), z.literal(1)]),
});

const sharedFields = {
  id: catalogIdSchema,
  category: categorySchema,
  name: z.string().min(1),
  heightM: positiveMetresSchema,
  unitCost: unitCostSchema,
  surface: surfaceSchema,
  maxGrade: slopeSchema.optional(),
  modelKey: slugSchema,
  scalePolicy: scalePolicySchema,
  crownRadiusMatureM: positiveMetresSchema.optional(),
  /** Trunk diameter at breast height at maturity; sizes the protected root zone. */
  matureDbhCm: z.number().positive().optional(),
  plots: z.int().positive().optional(),
};

const pointItemSchema = z.strictObject({
  ...sharedFields,
  geometryKind: z.literal('point'),
  footprint: z.strictObject({ widthM: positiveMetresSchema, depthM: positiveMetresSchema }),
});

const linearItemSchema = z.strictObject({
  ...sharedFields,
  geometryKind: z.literal('linear'),
  footprint: z.strictObject({ widthM: positiveMetresSchema }),
});

const areaItemSchema = z.strictObject({
  ...sharedFields,
  geometryKind: z.literal('area'),
  footprint: z.strictObject({
    minAreaM2: squareMetresSchema.positive(),
    defaultAreaM2: squareMetresSchema,
    module: areaModuleSchema.optional(),
    perimeter: perimeterSchema.optional(),
  }),
});

type UncheckedItem = z.infer<
  typeof pointItemSchema | typeof linearItemSchema | typeof areaItemSchema
>;

function treeRuleIssues(item: UncheckedItem): string[] {
  const isTree = item.category === 'tree';
  const issues: string[] = [];
  if (isTree !== (item.crownRadiusMatureM !== undefined)) {
    issues.push('Trees, and only trees, have crownRadiusMatureM');
  }
  if (isTree !== (item.matureDbhCm !== undefined))
    issues.push('Trees, and only trees, have matureDbhCm');
  if (isTree && item.geometryKind !== 'point') issues.push('Trees are point items');
  return issues;
}

function catalogRuleIssues(item: UncheckedItem): string[] {
  const issues = treeRuleIssues(item);
  if (item.geometryKind === 'area' && item.footprint.defaultAreaM2 < item.footprint.minAreaM2) {
    issues.push('defaultAreaM2 is below minAreaM2');
  }
  const hasModule = item.geometryKind === 'area' && item.footprint.module !== undefined;
  if (item.plots !== undefined && !hasModule) issues.push('Only items with a module have plots');
  return issues;
}

export const catalogItemSchema = z
  .discriminatedUnion('geometryKind', [pointItemSchema, linearItemSchema, areaItemSchema])
  .superRefine((item, ctx) => {
    catalogRuleIssues(item).forEach((message) => {
      ctx.addIssue({ code: 'custom', message, path: ['id'] });
    });
  });

export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type CatalogItemInput = z.input<typeof catalogItemSchema>;
export type AreaCatalogItem = Extract<CatalogItem, { geometryKind: 'area' }>;
export type AreaModule = z.infer<typeof areaModuleSchema>;

/** A fixed part the scene uses to build areas, such as a fence post or a raised bed. */
export const moduleKitItemSchema = z.strictObject({
  id: catalogIdSchema,
  name: z.string().min(1),
  widthM: positiveMetresSchema,
  depthM: positiveMetresSchema,
  heightM: positiveMetresSchema,
  modelKey: slugSchema,
  scalePolicy: scalePolicySchema,
});

export type ModuleKitItem = z.infer<typeof moduleKitItemSchema>;
export type ModuleKitItemInput = z.input<typeof moduleKitItemSchema>;
