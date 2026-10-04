import { QUEUE_BATCH_SIZE } from '@parkshape/core';

/** The marker in index.html that the build replaces with the vote preload plan. */
export const VOTE_PRELOAD_MARKER = '/* vote-preload */ null';

const VOTE_PAGE_MODULE = '/src/pages/vote-page.tsx';

/** The parts of a Rollup output chunk or asset that the plan reads. */
type BundleItem =
  | {
      readonly type: 'chunk';
      readonly fileName: string;
      readonly imports: readonly string[];
      /** Every module in the chunk. Rollup leaves facadeModuleId empty on a chunk that also exports
          to other chunks, so the plan looks for the vote page module here. */
      readonly moduleIds: readonly string[];
      readonly isEntry?: boolean;
    }
  | { readonly type: 'asset'; readonly fileName: string };

type Bundle = Readonly<Record<string, BundleItem>>;

/** What the inline script in index.html preloads: the vote page's chunks and the queue size. */
export interface VotePreloadPlan {
  readonly chunks: readonly string[];
  readonly queueSize: number;
}

/** The chunk and every chunk it imports statically, in depth-first order. */
function staticClosure(bundle: Bundle, start: string): string[] {
  const seen = new Set<string>();
  const visit = (fileName: string) => {
    const item = bundle[fileName];
    if (seen.has(fileName) || item?.type !== 'chunk') return;
    seen.add(fileName);
    item.imports.forEach(visit);
  };
  visit(start);
  return [...seen];
}

/**
 * The vote page chunk and the chunks it needs that the entry does not load already. The entry
 * and its imports are in index.html as a script and modulepreload links.
 */
export function votePreloadPlan(bundle: Bundle, base: string): VotePreloadPlan | null {
  const chunks = Object.values(bundle).flatMap((item) => (item.type === 'chunk' ? [item] : []));
  const vote = chunks.find((item) => item.moduleIds.some((id) => id.endsWith(VOTE_PAGE_MODULE)));
  if (vote === undefined) return null;
  const inEntry = new Set(
    chunks
      .filter((item) => item.isEntry === true)
      .flatMap((item) => staticClosure(bundle, item.fileName)),
  );
  const files = staticClosure(bundle, vote.fileName).filter((file) => !inEntry.has(file));
  return { chunks: files.map((file) => `${base}${file}`), queueSize: QUEUE_BATCH_SIZE };
}

/** Writes the plan into index.html, or `null` when there is none, as in dev. */
export function injectVotePreload(html: string, plan: VotePreloadPlan | null): string {
  if (!html.includes(VOTE_PRELOAD_MARKER)) {
    throw new Error(`index.html has no ${VOTE_PRELOAD_MARKER} marker for the vote-preload plan`);
  }
  return html.replace(VOTE_PRELOAD_MARKER, JSON.stringify(plan));
}
