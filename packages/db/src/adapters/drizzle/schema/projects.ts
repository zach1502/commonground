import { sql } from 'drizzle-orm';
import { check, date, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import type { JsonObject, ProjectStatus } from '../../../ports/records.js';

import { users } from './users.js';

// baseline_design_id has no foreign key: designs reference projects, and a cycle would
// force deferred constraints for no gain. The repository keeps the two in step.
export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    authorId: text('author_id').references(() => users.id),
    status: text('status').$type<ProjectStatus>().notNull(),
    parameters: jsonb('parameters').$type<JsonObject>().notNull(),
    parcel: jsonb('parcel').$type<JsonObject>().notNull(),
    heightmapRef: text('heightmap_ref').notNull(),
    baselineDesignId: text('baseline_design_id'),
    closesAt: date('closes_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    check('projects_status_check', sql`${table.status} in ('open', 'closed')`),
    // A double-submitted wizard or a retried create finds the first project instead of a copy.
    uniqueIndex('projects_author_name_idx').on(table.authorId, sql`lower(${table.name})`),
  ],
);
