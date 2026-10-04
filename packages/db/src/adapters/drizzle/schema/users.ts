import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import type { JsonObject, UserRole } from '../../../ports/records.js';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    role: text('role').$type<UserRole>().notNull(),
    displayName: text('display_name').notNull(),
    selfReport: jsonb('self_report').$type<JsonObject>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [check('users_role_check', sql`${table.role} in ('resident', 'staff')`)],
);
