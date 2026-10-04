import { vi } from 'vitest';

import type { Design, Project, User } from '../api/web-api';
import type {
  AddCommentInput,
  CommentChange,
  DesignComments,
  ReviewApi,
  ReviewComment,
} from '../features/review/review-api';

import { TEST_NOW } from './api-server';
import site from './review-site.json' with { type: 'json' };

/** A square parcel with a bench, a locked maple, a path and a lawn, by Gail Marigold. */
export const REVIEW_PROJECT = site.project as unknown as Project;
export const REVIEW_DESIGN = site.design as unknown as Design;

export const MOLLY: User = { id: 'u-molly', displayName: 'Molly Swingset', role: 'resident' };
export const GAIL = { displayName: 'Gail Marigold' } as const;

/** What makes a comment the caller's own while the edit window is open. */
export const MOLLY_OWN = {
  author: { displayName: MOLLY.displayName },
  mine: true,
  editable: true,
} as const satisfies Partial<ReviewComment>;

/** Five minutes before the test clock. */
const FIVE_MINUTES_MS = 300_000;

export function commentOf(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: 'c1',
    designId: 'd1',
    elementId: 'bench-1',
    elementKind: 'item',
    category: 'seating',
    kind: 'keep',
    text: 'Good spot for shade',
    createdAt: new Date(TEST_NOW.getTime() - FIVE_MINUTES_MS).toISOString(),
    status: 'open',
    hidden: false,
    surfacePoint: null,
    plannerReply: null,
    author: GAIL,
    mine: false,
    editable: false,
    ...overrides,
  };
}

const NO_COUNTS = { keep: 0, move: 0, change: 0, remove: 0, question: 0 };

function grouped(stored: readonly ReviewComment[]): DesignComments {
  const ids = [...new Set(stored.map((entry) => entry.elementId))];
  return {
    designId: 'd1',
    commenting: 'open',
    elements: ids.map((elementId) => {
      const comments = stored.filter((entry) => entry.elementId === elementId);
      const first = comments[0] ?? commentOf();
      const counts = { ...NO_COUNTS };
      comments.forEach((entry) => {
        counts[entry.kind] += 1;
      });
      const openCount = comments.filter((entry) => entry.status === 'open').length;
      const { elementKind, category } = first;
      return { elementId, elementKind, category, label: elementId, counts, openCount, comments };
    }),
  };
}

/** A mocked review client over a list of comments; a new comment is Molly's, at the test time. */
export function mockReviewApi(comments: readonly ReviewComment[] = []) {
  const stored = [...comments];
  return {
    stored,
    listComments: vi.fn(async () => Promise.resolve(grouped(stored))),
    addComment: vi.fn(async (_designId: string, input: AddCommentInput) => {
      const comment = commentOf({
        id: `c${String(stored.length + 1)}`,
        elementId: input.elementId,
        kind: input.kind,
        text: input.text ?? '',
        createdAt: TEST_NOW.toISOString(),
        surfacePoint: input.surfacePoint ?? null,
        ...MOLLY_OWN,
      });
      stored.push(comment);
      return Promise.resolve({ outcome: 'created' as const, comment });
    }),
    editComment: vi.fn(async (commentId: string, change: CommentChange) => {
      const index = stored.findIndex((entry) => entry.id === commentId);
      const edited = { ...commentOf(stored[index]), ...change };
      stored.splice(index, 1, edited);
      return Promise.resolve(edited);
    }),
  } satisfies ReviewApi & { readonly stored: ReviewComment[] };
}
