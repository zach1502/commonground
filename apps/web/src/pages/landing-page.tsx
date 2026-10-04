import { useLoaderData } from 'react-router';

import { ButtonLink, Inline, PageTitle } from '@parkshape/ui';

import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import { pluralise } from '../plural';
import type { LandingStats } from '../routing/loaders';
import { PATHS } from '../routing/paths';

import { deadlineLine, type Deadline } from './project-deadline';

// Rendered from the seeded baseline on the desktop tier: pnpm --filter @parkshape/scene render-hero.
const HERO_WIDTH = 1920;
const HERO_HEIGHT = 1080;
const HERO_NARROW_WIDTH = 960;
const HERO_SIZES = [HERO_NARROW_WIDTH, HERO_WIDTH] as const;
// React 18 has no fetchPriority prop, so the attribute goes through as written.
const HIGH_PRIORITY: Readonly<Record<string, string>> = { fetchpriority: 'high' };

const heroSet = (extension: 'webp' | 'png') =>
  HERO_SIZES.map((width) => `/hero/hero-${String(width)}.${extension} ${String(width)}w`).join(
    ', ',
  );

interface LandingData {
  readonly voteHref: string;
  /** The open project's gallery, or null when no project is open. */
  readonly galleryHref: string | null;
  readonly stats: LandingStats | null;
  readonly deadline: Deadline | null;
}

/** The render of the park, edge to edge under the title block, and the first image to load. */
function LandingHero({ alt }: { readonly alt: string }) {
  return (
    <figure className="web-landing__figure">
      <picture className="web-landing__hero">
        <source type="image/webp" srcSet={heroSet('webp')} sizes="100vw" />
        <img
          src={`/hero/hero-${String(HERO_WIDTH)}.png`}
          srcSet={heroSet('png')}
          sizes="100vw"
          alt={alt}
          width={HERO_WIDTH}
          height={HERO_HEIGHT}
          {...HIGH_PRIORITY}
        />
      </picture>
    </figure>
  );
}

/** "30 designs, 350 votes", with the design count linking to the gallery. */
function LandingStatsLine({
  stats,
  galleryHref,
}: {
  stats: LandingStats;
  galleryHref: string | null;
}) {
  const { landing } = messages;
  const designs = pluralise(stats.designs, landing.statsDesigns);
  const [before = '', after = ''] = format(landing.stats, { votes: stats.votes }).split(
    '{designs}',
  );
  return (
    <p className="web-landing__stats" data-kind="data">
      {before}
      {galleryHref === null ? designs : <a href={galleryHref}>{designs}</a>}
      {after}
    </p>
  );
}

/** Design a park is the one filled action; voting stays secondary at every width. */
function LandingActions({ voteHref }: { readonly voteHref: string }) {
  const { landing } = messages;
  return (
    <Inline gap="medium">
      <ButtonLink href={PATHS.projects} variant="primary">
        {landing.design}
      </ButtonLink>
      <ButtonLink href={voteHref} variant="secondary">
        {landing.vote}
      </ButtonLink>
    </Inline>
  );
}

/** The park name, one line, the primary action, the counts so far and a render of the park. */
export function LandingPage() {
  const { voteHref, galleryHref, stats, deadline } = useLoaderData<LandingData>();
  const { landing } = messages;
  const line = deadline === null ? landing.line : `${landing.line} ${deadlineLine(deadline)}`;
  useDocumentMeta(messages.meta.landing);
  return (
    <>
      <div className="web-page web-landing">
        <PageTitle lede={line}>{landing.heading}</PageTitle>
        <LandingActions voteHref={voteHref} />
        {stats === null ? null : <LandingStatsLine stats={stats} galleryHref={galleryHref} />}
      </div>
      <LandingHero alt={landing.imageAlt} />
    </>
  );
}
