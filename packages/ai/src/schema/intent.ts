import { z } from 'zod';

import { intentSchema } from '@parkshape/core';

import type { JsonSchema } from '../ports/llm-client.js';

// The Intent schema lives in core so the layout solver can read it; ai keeps its own names.
export {
  canopyPreferenceSchema as canopySchema,
  characterSchema,
  COMPASS_ZONES as ZONES,
  compassZoneSchema as zoneSchema,
  featureSizeSchema,
  intentCatalogIdSchema,
  intentFeatureSchema,
  intentPlacementSchema as placementSchema,
  intentSchema,
  MAX_DESCRIPTION_CHARS as MAX_DESCRIPTION_CHARS_ACCEPTED,
  MAX_FEATURE_COUNT,
  MAX_FEATURES,
  MAX_PLACE_NAME_CHARS,
  pathStyleSchema,
  terrainPreferenceSchema,
  type CanopyPreference as Canopy,
  type Character,
  type CompassZone as Zone,
  type FeatureSize,
  type Intent,
  type IntentFeature,
  type IntentPlacement as Placement,
  type PathStyle,
  type TerrainPreference,
} from '@parkshape/core';

/** Drops the draft marker; some OpenAI-compatible servers reject unknown top-level keys. */
export function toModelSchema(name: string, schema: z.ZodType): JsonSchema {
  const entries = Object.entries(z.toJSONSchema(schema)).filter(([key]) => key !== '$schema');
  return { name, schema: Object.fromEntries(entries) };
}

export const intentJsonSchema = toModelSchema('park-intent', intentSchema);
