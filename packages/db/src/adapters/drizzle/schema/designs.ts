import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import type { DesignStatus, JsonObject } from '../../../ports/records.js';

import { projects } from './projects.js';
import { users } from './users.js';

export const designs = pgTable(
  'designs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    blurb: text('blurb').notNull(),
    document: jsonb('document').$type<JsonObject>().notNull(),
    metrics: jsonb('metrics').$type<JsonObject>(),
    status: text('status').$type<DesignStatus>().notNull(),
    forkedFrom: text('forked_from'),
    versionOf: text('version_of'),
    thumbnailRef: text('thumbnail_ref'),
    up: integer('up').notNull().default(0),
    down: integer('down').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('designs_project_status_idx').on(table.projectId, table.status),
    check('designs_status_check', sql`${table.status} in ('draft', 'submitted', 'superseded')`),
  ],
);
