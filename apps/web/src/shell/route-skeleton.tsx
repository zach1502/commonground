import { Skeleton, SKELETON_DELAY_MS, SkeletonBlock } from '@parkshape/ui';

import { messages } from '../messages';

export type SkeletonKind = 'board' | 'gallery' | 'vote' | 'editor' | 'page' | 'none';

// The leaderboard shows 12 rows above the fold at 1280 by 800, so its skeleton does too.
const BOARD_ROWS = 12;
const GALLERY_CARDS = 3;
const VOTE_BUTTONS = 3;
const PAGE_LINES = 3;

const KIND_BY_PATTERN: readonly (readonly [RegExp, SkeletonKind])[] = [
  [/\/design\/(?!new$|describe)[^/]+$/, 'none'],
  [/\/leaderboard$/, 'board'],
  [/\/insights$/, 'board'],
  [/\/designs$/, 'gallery'],
  [/\/vote$/, 'vote'],
];

/** Which placeholder layout matches the page at a path. */
export function skeletonKindFor(pathname: string): SkeletonKind {
  return KIND_BY_PATTERN.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'page';
}

/**
 * The layout for the first load. Moving to the editor keeps the old page on screen, but a first
 * visit has no old page, so the editor gets its bar and stage.
 */
export function bootKindFor(pathname: string): SkeletonKind {
  const kind = skeletonKindFor(pathname);
  return kind === 'none' ? 'editor' : kind;
}

/**
 * How content appears once a skeleton has stood in for it: a 150 ms fade, or at once on the vote
 * route, where the first picture is the LCP element and must not start at opacity 0. The app
 * shell passes this to `SkeletonReveal`.
 */
export function revealFor(kind: SkeletonKind): 'fade' | 'instant' {
  return kind === 'vote' || kind === 'none' ? 'instant' : 'fade';
}

/** The rest of the first second after navigation started, `now` ms ago; never below 0. */
export function skeletonDelayAt(now: number): number {
  return Math.max(0, SKELETON_DELAY_MS - now);
}

function blocks(count: number, shape: 'row' | 'card' | 'button' | 'line') {
  return Array.from({ length: count }, (_, index) => <SkeletonBlock key={index} shape={shape} />);
}

function Title() {
  return (
    <div className="web-skeleton__title">
      <SkeletonBlock shape="line" />
      <SkeletonBlock shape="heading" />
    </div>
  );
}

/** The leaderboard and insights: the count line, then table rows. */
function Board() {
  return (
    <>
      <div className="web-skeleton__meta">
        <SkeletonBlock shape="line" />
        <SkeletonBlock shape="button" />
      </div>
      <div className="web-skeleton__rows">{blocks(BOARD_ROWS, 'row')}</div>
    </>
  );
}

function Body({ kind }: { readonly kind: Exclude<SkeletonKind, 'none'> }) {
  if (kind === 'board') return <Board />;
  if (kind === 'gallery') {
    return <div className="web-skeleton__cards">{blocks(GALLERY_CARDS, 'card')}</div>;
  }
  if (kind === 'editor') {
    return (
      <>
        <div className="web-skeleton__meta">
          <SkeletonBlock shape="line" />
          <SkeletonBlock shape="button" />
        </div>
        <SkeletonBlock shape="poster" />
      </>
    );
  }
  if (kind === 'vote') {
    return (
      <>
        <SkeletonBlock shape="poster" />
        <div className="web-skeleton__vote-buttons">{blocks(VOTE_BUTTONS, 'button')}</div>
      </>
    );
  }
  return <>{blocks(PAGE_LINES, 'line')}</>;
}

/**
 * Grey blocks in the shape of the page that is loading, shown after 1 s. The editor draws its own
 * loading state, so it gets none.
 */
export function RouteSkeleton({
  kind,
  delayMs,
}: {
  readonly kind: SkeletonKind;
  readonly delayMs?: number;
}) {
  if (kind === 'none') return null;
  return (
    <Skeleton
      label={messages.app.loading}
      className={`web-page web-skeleton web-skeleton--${kind}`}
      {...(delayMs === undefined ? {} : { delayMs })}
    >
      {kind === 'editor' ? null : <Title />}
      <Body kind={kind} />
    </Skeleton>
  );
}
