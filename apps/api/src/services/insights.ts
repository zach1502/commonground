import {
  catalogIndex,
  computeInsights,
  csvChunks,
  dxfChunks,
  geoJsonChunks,
  insightsGrid,
  rankDesigns,
  roundedValues,
  selfReportSchema,
  voteReasonSchema,
  type ConstraintKey,
  type ConstraintStatus,
  type ExportInput,
  type InsightDesign,
  type InsightMetrics,
  type Insights,
  type InsightsInput,
  type InsightVote,
  type Participant,
} from '@parkshape/core';
import type { Design, Project, Repositories, Vote } from '@parkshape/db';

import { metricsSchema } from '../contracts/common.js';
import type { InsightsBody } from '../contracts/insights.js';
import type { AppDeps } from '../deps.js';

import { loadProject, storedDocument, storedParameters, storedParcel } from './access.js';
import { voteComments } from './insight-comments.js';

export type ExportFormat = 'csv' | 'geojson' | 'dxf';

/** Reads the stored report; a design stored with a report that no longer parses has none. */
function insightMetrics(design: Design): InsightMetrics | null {
  const parsed = metricsSchema.safeParse(design.metrics);
  if (!parsed.success) return null;
  const constraints = Object.fromEntries(
    Object.entries(parsed.data.constraints).map(([key, result]) => [key, result.status]),
  ) as Partial<Record<ConstraintKey, ConstraintStatus>>;
  return { constraints, netM3: parsed.data.totals.net };
}

function insightDesign(design: Design): InsightDesign {
  const { id, title, authorId, up, down } = design;
  return {
    id,
    title,
    authorId,
    up,
    down,
    document: storedDocument(design),
    metrics: insightMetrics(design),
  };
}

/** A stored vote as the insights rules read it; reasons that no longer parse are dropped. */
export function insightVote(vote: Vote): InsightVote {
  const reasons = vote.reasons.flatMap((reason) => {
    const parsed = voteReasonSchema.safeParse(reason);
    return parsed.success ? [parsed.data] : [];
  });
  return { designId: vote.designId, userId: vote.userId, value: vote.value, reasons };
}

async function participants(
  repos: Repositories,
  userIds: readonly string[],
): Promise<Participant[]> {
  const users = await Promise.all([...new Set(userIds)].map((id) => repos.users.findById(id)));
  return users.flatMap((user) => {
    if (user === undefined) return [];
    const parsed = selfReportSchema.safeParse(user.selfReport);
    return [{ userId: user.id, selfReport: parsed.success ? parsed.data : null }];
  });
}

async function baselineOf(repos: Repositories, project: Project) {
  if (project.baselineDesignId === null) return null;
  const baseline = await repos.designs.findById(project.baselineDesignId);
  return baseline === undefined ? null : storedDocument(baseline);
}

interface ProjectReads {
  readonly project: Project;
  readonly live: readonly Design[];
  readonly stored: readonly Vote[];
}

async function insightsInput(
  repos: Repositories,
  { project, live, stored }: ProjectReads,
): Promise<InsightsInput> {
  const votes = stored.map(insightVote);
  const people = [...votes.map((vote) => vote.userId), ...live.map((design) => design.authorId)];
  return {
    designs: live.map(insightDesign),
    votes,
    participants: await participants(repos, people),
    baseline: await baselineOf(repos, project),
    catalog: catalogIndex,
    grid: insightsGrid(storedParcel(project)),
  };
}

/** Copies the read-only core result into the JSON body, with heatmaps as rounded arrays. */
function presentInsights(insights: Insights): Omit<InsightsBody, 'comments'> {
  const { reasons, engagement, earthworks } = insights;
  return {
    headline: insights.headline,
    features: [...insights.features],
    heatmaps: insights.heatmaps.map(({ category, grid, values }) => ({
      category,
      width: grid.width,
      height: grid.height,
      cellM: grid.cellM,
      originLocal: { x: grid.originLocal.x, y: grid.originLocal.y },
      values: roundedValues(values),
    })),
    baselineDiff: [...insights.baselineDiff],
    compliance: [...insights.compliance],
    earthworks: { binM3: earthworks.binM3, bins: [...earthworks.bins] },
    reasons: {
      overall: [...reasons.overall],
      up: [...reasons.up],
      down: [...reasons.down],
      byDesign: reasons.byDesign.map((design) => ({ ...design, counts: [...design.counts] })),
    },
    engagement: { byFsa: [...engagement.byFsa], byAgeBand: [...engagement.byAgeBand] },
  };
}

/** Planner insights for one project, reused for a few seconds so polling stays cheap. */
export async function projectInsights(deps: AppDeps, projectId: string): Promise<InsightsBody> {
  const project = await loadProject(deps.repos, projectId);
  return deps.insightsCache.get(project.id, async () => {
    const live = await deps.repos.designs.listByProject(project.id, 'submitted');
    const stored = await deps.repos.votes.listByProject(project.id);
    const insights = computeInsights(await insightsInput(deps.repos, { project, live, stored }));
    return {
      ...presentInsights(insights),
      comments: await voteComments(deps.repos, live, stored),
    };
  });
}

async function exportInput(deps: AppDeps, projectId: string, count: number): Promise<ExportInput> {
  const project = await loadProject(deps.repos, projectId);
  const live = await deps.repos.designs.listByProject(project.id, 'submitted');
  const ranked = rankDesigns(live, storedParameters(project).scoringPrior).slice(0, count);
  return {
    parcel: storedParcel(project),
    catalog: catalogIndex,
    designs: ranked.map((design, index) => ({
      rank: index + 1,
      score: design.score,
      design: insightDesign(design),
    })),
  };
}

const WRITERS = { csv: csvChunks, geojson: geoJsonChunks, dxf: dxfChunks } as const;

/** The chunks of an export file for the top designs by leaderboard rank. */
export async function exportChunks(
  deps: AppDeps,
  request: { readonly projectId: string; readonly count: number; readonly format: ExportFormat },
): Promise<Iterable<string>> {
  const input = await exportInput(deps, request.projectId, request.count);
  return WRITERS[request.format](input);
}
