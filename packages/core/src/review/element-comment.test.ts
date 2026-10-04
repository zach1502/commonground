import { describe, expect, it } from 'vitest';

import {
  COMMENT_CHIP_MAX_DISTANCE_M,
  COMMENT_EDIT_WINDOW_MS,
  ELEMENT_COMMENT_MAX_CHARS,
  PLANNER_REPLY_MAX_CHARS,
} from '../constants.js';

import {
  COMMENT_KIND_LABEL_KEYS,
  COMMENT_KINDS,
  canComment,
  canEdit,
  canModerate,
  elementCommentSchema,
  newElementCommentSchema,
  type ElementComment,
} from './element-comment.js';

const CREATED_AT = '2026-10-03T12:00:00.000Z';
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

const stored = {
  id: 'comment-1',
  designId: 'design-1',
  elementId: 'bench-1',
  elementKind: 'item',
  category: 'seating',
  authorId: 'resident-a',
  kind: 'move',
  text: 'This bench should face the playground',
  createdAt: CREATED_AT,
  status: 'open',
  hidden: false,
};

function comment(): ElementComment {
  return elementCommentSchema.parse(stored);
}

describe('elementCommentSchema', () => {
  it('parses a stored comment', () => {
    expect(comment()).toMatchObject({ kind: 'move', status: 'open', hidden: false });
  });

  it('allows empty text, since the kind alone counts', () => {
    expect(elementCommentSchema.parse({ ...stored, text: '' }).text).toBe('');
  });

  it('keeps text at the limit and refuses one character more', () => {
    const atLimit = 'a'.repeat(ELEMENT_COMMENT_MAX_CHARS);
    expect(elementCommentSchema.safeParse({ ...stored, text: atLimit }).success).toBe(true);
    expect(elementCommentSchema.safeParse({ ...stored, text: `${atLimit}a` }).success).toBe(false);
  });

  it('refuses HTML and allows a lone angle bracket', () => {
    expect(elementCommentSchema.safeParse({ ...stored, text: '<i>no</i>' }).success).toBe(false);
    expect(elementCommentSchema.safeParse({ ...stored, text: 'cost < $5' }).success).toBe(true);
  });

  it('refuses a kind or status outside the lists', () => {
    expect(elementCommentSchema.safeParse({ ...stored, kind: 'like' }).success).toBe(false);
    expect(elementCommentSchema.safeParse({ ...stored, status: 'closed' }).success).toBe(false);
  });

  it('carries a planner reply with its time', () => {
    const plannerReply = { text: 'We moved it.', repliedAt: CREATED_AT };
    const resolved = elementCommentSchema.parse({ ...stored, status: 'resolved', plannerReply });
    expect(resolved.plannerReply).toEqual(plannerReply);
  });

  it('refuses an empty or over-long planner reply', () => {
    const reply = (text: string) => ({ ...stored, plannerReply: { text, repliedAt: CREATED_AT } });
    expect(elementCommentSchema.safeParse(reply(' ')).success).toBe(false);
    const long = 'a'.repeat(PLANNER_REPLY_MAX_CHARS + 1);
    expect(elementCommentSchema.safeParse(reply(long)).success).toBe(false);
  });

  it('refuses fields it does not know', () => {
    expect(elementCommentSchema.safeParse({ ...stored, likes: 3 }).success).toBe(false);
  });
});

describe('newElementCommentSchema', () => {
  it('takes only the element, kind, text and surface point from the body', () => {
    const body = {
      elementId: 'walk-1',
      kind: 'change',
      text: 'Wider',
      surfacePoint: { x: 4, y: 5 },
    };
    expect(newElementCommentSchema.parse(body)).toEqual(body);
    const withKind = { ...body, elementKind: 'path' };
    expect(newElementCommentSchema.safeParse(withKind).success).toBe(false);
  });
});

describe('comment kinds', () => {
  it('lists the five kinds in the order the composer shows them', () => {
    expect(COMMENT_KINDS).toEqual(['keep', 'move', 'change', 'remove', 'question']);
  });

  it('names each kind by a locale key, never by display words', () => {
    expect(COMMENT_KIND_LABEL_KEYS).toEqual({
      keep: 'review.kind.keep',
      move: 'review.kind.move',
      change: 'review.kind.change',
      remove: 'review.kind.remove',
      question: 'review.kind.question',
    });
  });
});

describe('comment rules', () => {
  it('takes comments on a submitted design while the project is open', () => {
    expect(canComment('open', { status: 'submitted' })).toBe(true);
    expect(canComment('closed', { status: 'submitted' })).toBe(false);
    expect(canComment('open', { status: 'draft' })).toBe(false);
    expect(canComment('open', { status: 'superseded' })).toBe(false);
  });

  it('lets the author edit for 15 minutes after writing', () => {
    const created = Date.parse(CREATED_AT);
    const at = (offsetMs: number) => new Date(created + offsetMs);
    const fifteenMinutes = 15 * MINUTE_MS;
    expect(COMMENT_EDIT_WINDOW_MS).toBe(fifteenMinutes);
    expect(canEdit(comment(), 'resident-a', at(fifteenMinutes - MINUTE_MS))).toBe(true);
    expect(canEdit(comment(), 'resident-a', at(fifteenMinutes + MINUTE_MS))).toBe(false);
  });

  it('never lets another person edit', () => {
    expect(canEdit(comment(), 'resident-b', new Date(CREATED_AT))).toBe(false);
  });

  it('lets only staff moderate', () => {
    expect(canModerate('staff')).toBe(true);
    expect(canModerate('resident')).toBe(false);
  });

  it('hides chips past 60 m', () => {
    expect(COMMENT_CHIP_MAX_DISTANCE_M).toBe(60);
  });
});
