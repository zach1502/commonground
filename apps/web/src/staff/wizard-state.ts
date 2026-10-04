import { z } from 'zod';

import {
  designDocumentSchema,
  projectParametersSchema,
  type DesignDocument,
  type ProjectParameters,
} from '@parkshape/core';

import type { GeoJsonPolygon, SiteFeatures, TerrainLoad } from '../api/staff-api';
import type { Project } from '../api/web-api';

import type { LockChoice } from './baseline';
import type { ParametersDraft } from './parameters-form';

export const WIZARD_STORAGE_KEY = 'parkshape.planner-wizard';
/** The editor keeps the baseline's undo history under this design id while the wizard runs. */
export const WIZARD_BASELINE_ID = 'planner-wizard-baseline';

/** The outline chosen in step 1: a park found by name, or one drawn on the map. */
export interface ChosenSite {
  readonly parkName: string | null;
  readonly polygonWgs84: GeoJsonPolygon;
}

/** Everything the six steps have gathered; kept in sessionStorage so Back loses nothing. */
export interface WizardState {
  readonly version: 1;
  readonly mode: 'search' | 'draw';
  readonly query: string;
  readonly site: ChosenSite | null;
  readonly terrain: TerrainLoad | null;
  readonly features: SiteFeatures | null;
  readonly locks: Readonly<Record<string, LockChoice>>;
  readonly draft: ParametersDraft | null;
  readonly parameters: ProjectParameters | null;
  readonly baseline: DesignDocument | null;
  readonly name: string;
  /** The date input's value in step 4: an ISO date, or empty for no closing day. */
  readonly closesAt: string;
  /**
   * The project Publish created. Set once POST /projects answers, so pressing Publish again, or
   * retrying a failed picture, reuses it instead of opening a second project.
   */
  readonly published: Project | null;
}

export const EMPTY_WIZARD: WizardState = {
  version: 1,
  mode: 'search',
  query: '',
  site: null,
  terrain: null,
  features: null,
  locks: {},
  draft: null,
  parameters: null,
  baseline: null,
  name: '',
  closesAt: '',
  published: null,
};

// API payloads were checked by the server when they arrived; the parts the app rebuilds from
// scratch (parameters and the baseline) are parsed again with the core schemas.
const stored = <T>() => z.custom<T>((value) => typeof value === 'object');

const storedSchema = z.object({
  version: z.literal(1),
  mode: z.enum(['search', 'draw']),
  query: z.string(),
  site: stored<ChosenSite>().nullable(),
  terrain: stored<TerrainLoad>().nullable(),
  features: stored<SiteFeatures>().nullable(),
  locks: z.record(z.string(), z.enum(['locked', 'unlocked'])),
  draft: stored<ParametersDraft>().nullable(),
  parameters: projectParametersSchema.nullable(),
  baseline: designDocumentSchema.nullable(),
  name: z.string(),
  // Added after the first release; a wizard saved before it loads with no closing day.
  closesAt: z.string().default(''),
  published: stored<Project>().nullable().default(null),
});

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function loadWizard(storage: Storage): WizardState {
  const text = storage.getItem(WIZARD_STORAGE_KEY);
  if (text === null) return EMPTY_WIZARD;
  const parsed = storedSchema.safeParse(parseJson(text));
  return parsed.success ? parsed.data : EMPTY_WIZARD;
}

export function saveWizard(storage: Storage, state: WizardState): void {
  storage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
}

/**
 * Applies a change. A new site clears everything after it, and new features or locks clear the
 * refined baseline, so no later step keeps data built from an earlier answer that changed.
 */
export function applyChange(state: WizardState, change: Partial<WizardState>): WizardState {
  const next = { ...state, ...change };
  if ('site' in change && change.site !== state.site) {
    return { ...next, terrain: null, features: null, locks: {}, baseline: null };
  }
  if (('features' in change && change.features !== state.features) || 'locks' in change) {
    return { ...next, baseline: null };
  }
  return next;
}
