import type { LoaderFunctionArgs } from 'react-router';

import type { Heightmap } from '@parkshape/core';

import type { Insights, ProjectSummary } from '../api/staff-api';
import type { Project, Role, User } from '../api/web-api';
import type { WebDeps } from '../app-deps';

import { notFoundOn404 } from './loaders';

export interface InsightsData {
  readonly project: Project;
  readonly insights: Insights;
  /**
   * The baseline document as the API sent it, drawn under the heatmap; null when the project has
   * none. The page parses it, so this loader ships in the entry and starts with the session check.
   */
  readonly baseline: unknown;
  /**
   * The recorded ground under the heatmap; null draws the flat parcel. It is asked for once the
   * insights have arrived, while three.js loads, so it never shares the link with the numbers.
   */
  readonly terrain: Promise<Heightmap | null>;
  /** The generated summary; null when the summary is off or fails, so the page leaves it out. */
  readonly summary: ProjectSummary | null;
}

type SessionFor = (audience: Role) => Promise<User | Response>;

/** Staff only: the project, its insights and its baseline design for the terrain view. */
export function insightsLoader(api: WebDeps['api'], sessionFor: SessionFor) {
  return async ({
    params,
  }: Pick<LoaderFunctionArgs, 'params'>): Promise<InsightsData | Response> => {
    const user = await sessionFor('staff');
    if (user instanceof Response) return user;
    const id = params.id ?? '';
    return notFoundOn404(async () => {
      const project = api.getProject(id);
      const [loaded, insights, summary, baseline] = await Promise.all([
        project,
        api.getInsights(id),
        api.getSummary(id).catch(() => null),
        project.then(async ({ baselineDesignId }) =>
          baselineDesignId === null ? null : (await api.getDesign(baselineDesignId)).document,
        ),
      ]);
      const terrain = api.getTerrain(id).catch(() => null);
      return { project: loaded, insights, baseline, summary, terrain };
    });
  };
}
