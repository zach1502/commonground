import { catalogIndex, type DesignDocument, type MetricsReport } from '@parkshape/core';

import {
  composeBlurb,
  composeTitle,
  loadFragmentBank,
  type DesignFacts,
  type FragmentBank,
  type LeadTag,
  type SeedTag,
} from './fragments.js';
import { generatedIntents, solveIntent } from './generated.js';
import type { SeedSite } from './jonathan-rogers.js';
import { seedPeople, type SeedPeople, type SeedPersona } from './personas.js';
import { planSelfReports, type PlannedSelfReport } from './self-reports.js';
import { loadShowcase, storedBlurb, type ShowcaseDesign } from './showcase.js';
import { planVotes, type PlannedVote } from './votes.js';

export type SeedDesignKind = 'showcase' | 'generated';

/** The solved layout and the blurb that quotes it. */
export interface BuiltDesign {
  readonly document: DesignDocument;
  readonly blurb: string;
}

/**
 * One design the seed makes, keyed by its natural key: author and title. The layout is solved
 * only when `build` is called, so a rerun over a seeded database solves nothing.
 */
export interface PlannedDesign {
  readonly key: string;
  readonly kind: SeedDesignKind;
  readonly author: SeedPersona;
  readonly title: string;
  readonly tags: readonly SeedTag[];
  build(): BuiltDesign;
}

export interface SeedPlan {
  readonly site: SeedSite;
  readonly people: SeedPeople;
  readonly designs: readonly PlannedDesign[];
  readonly votes: readonly PlannedVote[];
  readonly selfReports: readonly PlannedSelfReport[];
}

export interface SeedPlanSources {
  readonly people?: SeedPeople;
  readonly bank?: FragmentBank;
  readonly showcase?: readonly ShowcaseDesign[];
  /** How many generated designs to include; all 25 by default. Tests use fewer. */
  readonly generatedCount?: number;
}

/** Runs `build` once and keeps the result; solving a layout takes about a second. */
function once(build: () => BuiltDesign): () => BuiltDesign {
  let built: BuiltDesign | undefined;
  return () => (built ??= build());
}

/** The natural key the seed matches existing designs on. */
export function designKey(authorId: string, title: string): string {
  return `${authorId}\n${title}`;
}

function residentAt(people: SeedPeople, index: number): SeedPersona {
  const resident = people.residents[index];
  if (resident === undefined) throw new Error(`No seeded resident ${String(index)}`);
  return resident;
}

function polylineLength(points: readonly { readonly x: number; readonly y: number }[]): number {
  return points.reduce((total, point, index) => {
    const previous = points[index - 1];
    return previous === undefined
      ? total
      : total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

function pathLength(document: DesignDocument): number {
  return document.paths.reduce((total, path) => total + polylineLength(path.points), 0);
}

/** The numbers a blurb can quote, read from the solved design and its metrics. */
export function designFacts(document: DesignDocument, report: MetricsReport): DesignFacts {
  const trees = document.items.filter(
    (item) => catalogIndex.get(item.catalogId)?.category === 'tree',
  );
  return {
    lockedTrees: trees.filter((item) => item.locked).length,
    newTrees: trees.filter((item) => !item.locked).length,
    plots: report.totals.gardenPlots,
    costCad: report.totals.costCad,
    pathM: pathLength(document),
  };
}

function showcaseDesign(site: SeedSite, people: SeedPeople, entry: ShowcaseDesign): PlannedDesign {
  const author = residentAt(people, entry.author);
  return {
    key: designKey(author.id, entry.title),
    kind: 'showcase',
    author,
    title: entry.title,
    tags: entry.tags,
    build: once(() => ({
      document: solveIntent(site, entry.intent, entry.seed).document,
      blurb: storedBlurb(entry.blurb),
    })),
  };
}

function generatedDesigns(site: SeedSite, sources: Required<SeedPlanSources>): PlannedDesign[] {
  const firstAuthor = sources.showcase.length;
  return generatedIntents()
    .slice(0, sources.generatedCount)
    .map((entry) => {
      const author = residentAt(sources.people, firstAuthor + entry.index);
      const lead: LeadTag = entry.lead;
      const title = composeTitle(sources.bank, {
        lead,
        pathStyle: entry.intent.paths.style,
        variant: entry.variant,
      });
      const build = (): BuiltDesign => {
        const { document, report } = solveIntent(site, entry.intent, entry.seed);
        const facts = designFacts(document, report);
        return {
          document,
          blurb: composeBlurb(sources.bank, { lead, variant: entry.index, facts }),
        };
      };
      return {
        key: designKey(author.id, title),
        kind: 'generated',
        author,
        title,
        tags: entry.tags,
        build: once(build),
      } satisfies PlannedDesign;
    });
}

/** Every design, vote and self report the seed makes, computed without touching a database. */
export function buildSeedPlan(site: SeedSite, sources: SeedPlanSources = {}): SeedPlan {
  const resolved: Required<SeedPlanSources> = {
    people: sources.people ?? seedPeople(),
    bank: sources.bank ?? loadFragmentBank(),
    showcase: sources.showcase ?? loadShowcase(),
    generatedCount: sources.generatedCount ?? Number.POSITIVE_INFINITY,
  };
  const designs = [
    ...resolved.showcase.map((entry) => showcaseDesign(site, resolved.people, entry)),
    ...generatedDesigns(site, resolved),
  ];
  const targets = designs.map(({ key, author, tags }) => ({ key, authorId: author.id, tags }));
  return {
    site,
    people: resolved.people,
    designs,
    votes: planVotes(targets, resolved.people.residents),
    selfReports: planSelfReports(resolved.people.residents),
  };
}
