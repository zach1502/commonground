import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

import type { VoteValue } from '../../../ports/records.js';

import { designs } from './designs.js';
import { users } from './users.js';

// VOTE_COMMENT_MAX_CHARS in @parkshape/core. drizzle-kit loads this file as CommonJS and cannot
// load core, so the cap is copied here; vote-repository.test.ts holds the two equal.
const COMMENT_MAX_CHARS = 500;

export const votes = pgTable(
  'votes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    designId: text('design_id')
      .notNull()
      .references(() => designs.id),
    value: integer('value').$type<VoteValue>().notNull(),
    reasons: text('reasons').array().notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    unique('votes_user_design_unique').on(table.userId, table.designId),
    check('votes_value_check', sql`${table.value} in (-1, 1)`),
    check(
      'votes_comment_length_check',
      sql`char_length(${table.comment}) <= ${sql.raw(String(COMMENT_MAX_CHARS))}`,
    ),
  ],
);
