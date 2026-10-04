import type { z } from '@hono/zod-openapi';

import type { Session } from '@parkshape/auth';
import {
  designDocumentSchema,
  parcelSchema,
  projectParametersSchema,
  projectPhase,
} from '@parkshape/core';
import type { Design, DesignSummary, Project, Repositories } from '@parkshape/db';

import { metricsSchema } from './contracts/common.js';
import type {
  designSchema,
  designSummarySchema,
  projectSchema,
} from './contracts/projects-designs.js';
import { softWarningsFrom, type ConstraintReadouts, type SoftWarning } from './rules/badges.js';

type ProjectBody = z.infer<typeof projectSchema>;
type DesignSummaryBody = z.infer<typeof designSummarySchema>;
type DesignBody = z.infer<typeof designSchema>;
type AuthorBody = DesignSummaryBody['author'];
type MetricsBody = z.infer<typeof metricsSchema>;

/** Resolves a stored blob key to a URL the browser can load, or null when there is none. */
export type UrlFor = (key: string) => string;

/** Stored JSON is parsed on the way out, so a bad row fails loudly instead of leaking. */
export function presentProject(project: Project, now: Date): ProjectBody {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    parameters: projectParametersSchema.parse(project.parameters),
    parcel: parcelSchema.parse(project.parcel),
    heightmapRef: project.heightmapRef,
    baselineDesignId: project.baselineDesignId,
    closesAt: project.closesAt,
    phase: projectPhase(project, now),
    createdAt: project.createdAt.toISOString(),
  };
}

function presentMetrics(metrics: Design['metrics']): MetricsBody | null {
  return metrics === null ? null : metricsSchema.parse(metrics);
}

/** Soft warnings from the stored metrics, so the gallery can badge each design. */
function badgesOf(metrics: MetricsBody | null): SoftWarning[] {
  return metrics === null ? [] : softWarningsFrom(metrics.constraints as ConstraintReadouts);
}

export function presentDesignSummary(
  design: DesignSummary,
  author: AuthorBody,
  urlFor: UrlFor,
): DesignSummaryBody {
  const metrics = presentMetrics(design.metrics);
  return {
    id: design.id,
    projectId: design.projectId,
    title: design.title,
    blurb: design.blurb,
    status: design.status,
    metrics,
    forkedFrom: design.forkedFrom,
    versionOf: design.versionOf,
    thumbnailRef: design.thumbnailRef,
    thumbnailUrl: design.thumbnailRef === null ? null : urlFor(design.thumbnailRef),
    badges: badgesOf(metrics),
    up: design.up,
    down: design.down,
    createdAt: design.createdAt.toISOString(),
    submittedAt: design.submittedAt?.toISOString() ?? null,
    author,
  };
}

export function presentDesign(
  design: Design,
  author: AuthorBody,
  urlFor: UrlFor,
  supersededBy: string | null,
): DesignBody {
  return {
    ...presentDesignSummary(design, author, urlFor),
    document: designDocumentSchema.parse(design.document),
    lineage: { forkedFrom: design.forkedFrom, versionOf: design.versionOf, supersededBy },
    updatedAt: design.updatedAt.toISOString(),
  };
}

/** Who the caller is and which designs they voted on: what decides whether authors show. */
export interface Viewer {
  readonly session: Session | undefined;
  readonly votedDesignIds: ReadonlySet<string>;
}

export async function viewerFor(
  repos: Repositories,
  session: Session | undefined,
): Promise<Viewer> {
  if (session === undefined) {
    return { session, votedDesignIds: new Set() };
  }
  const votes = await repos.votes.listByUser(session.userId);
  return { session, votedDesignIds: new Set(votes.map((vote) => vote.designId)) };
}

/**
 * Resolves authors for a batch of designs, revealing one only to its author or to someone
 * who has voted on it, so votes are not swayed by who made a design.
 */
export async function authorsFor(
  repos: Repositories,
  designs: readonly DesignSummary[],
  viewer: Viewer,
): Promise<Map<string, AuthorBody>> {
  const names = new Map<string, string>();
  const authors = new Map<string, AuthorBody>();
  for (const design of designs) {
    const own = viewer.session?.userId === design.authorId;
    if (!own && !viewer.votedDesignIds.has(design.id)) {
      authors.set(design.id, null);
      continue;
    }
    const name =
      names.get(design.authorId) ?? (await repos.users.findById(design.authorId))?.displayName;
    names.set(design.authorId, name ?? 'Unknown');
    authors.set(design.id, { id: design.authorId, displayName: name ?? 'Unknown' });
  }
  return authors;
}

export async function presentSummaries(
  repos: Repositories,
  designs: readonly DesignSummary[],
  viewer: Viewer,
  urlFor: UrlFor,
): Promise<DesignSummaryBody[]> {
  const authors = await authorsFor(repos, designs, viewer);
  return designs.map((design) =>
    presentDesignSummary(design, authors.get(design.id) ?? null, urlFor),
  );
}
