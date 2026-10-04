import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import type { Category, CommentKind, CommentStatus, ElementKind } from '@parkshape/core';

import { designs } from './designs.js';
import { users } from './users.js';

// drizzle-kit loads this file as CommonJS and cannot load core, so the caps and lists are copied
// here; element-comment-repository.test.ts holds them equal to core's.
export const ELEMENT_COMMENT_TEXT_MAX_CHARS = 280;
export const PLANNER_REPLY_TEXT_MAX_CHARS = 500;
export const STORED_COMMENT_KINDS = ['keep', 'move', 'change', 'remove', 'question'] as const;
export const STORED_COMMENT_STATUSES = ['open', 'resolved'] as const;
export const STORED_ELEMENT_KINDS = ['item', 'path', 'area'] as const;

function quotedList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

export const elementComments = pgTable(
  'element_comments',
  {
    id: text('id').primaryKey(),
    designId: text('design_id')
      .notNull()
      .references(() => designs.id, { onDelete: 'cascade' }),
    elementId: text('element_id').notNull(),
    elementKind: text('element_kind').$type<ElementKind>().notNull(),
    category: text('category').$type<Category>().notNull(),
    surfaceX: doublePrecision('surface_x'),
    surfaceY: doublePrecision('surface_y'),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').$type<CommentKind>().notNull(),
    text: text('text').notNull(),
    status: text('status').$type<CommentStatus>().notNull(),
    hidden: boolean('hidden').notNull().default(false),
    replyText: text('reply_text'),
    repliedAt: timestamp('replied_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    index('element_comments_design_idx').on(table.designId),
    // One open comment per author, element and kind; resolving one frees the slot.
    uniqueIndex('element_comments_open_unique')
      .on(table.designId, table.elementId, table.authorId, table.kind)
      .where(sql`${table.status} = 'open'`),
    check(
      'element_comments_kind_check',
      sql`${table.kind} in (${quotedList(STORED_COMMENT_KINDS)})`,
    ),
    check(
      'element_comments_status_check',
      sql`${table.status} in (${quotedList(STORED_COMMENT_STATUSES)})`,
    ),
    check(
      'element_comments_element_kind_check',
      sql`${table.elementKind} in (${quotedList(STORED_ELEMENT_KINDS)})`,
    ),
    check(
      'element_comments_text_length_check',
      sql`char_length(${table.text}) <= ${sql.raw(String(ELEMENT_COMMENT_TEXT_MAX_CHARS))}`,
    ),
    check(
      'element_comments_reply_length_check',
      sql`char_length(${table.replyText}) <= ${sql.raw(String(PLANNER_REPLY_TEXT_MAX_CHARS))}`,
    ),
  ],
);
