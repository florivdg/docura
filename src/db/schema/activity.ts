import { sql } from 'drizzle-orm'
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  ACTIVITY_ACTIONS,
  ACTOR_TYPES,
  type ActivityAction,
  type ActivityChanges,
  type ActorType,
} from '../../lib/activity'
import { user } from './auth'
import { document } from './documents'

const inList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '))

/**
 * Append-only audit trail. Document and actor are referenced with ON DELETE
 * SET NULL; the name snapshots keep entries of deleted documents and removed
 * users readable. Rows of one request or worker call share `batch_id`.
 */
export const documentActivity = pgTable(
  'document_activity',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id').references(() => document.id, {
      onDelete: 'set null',
    }),
    /** The document's name after the action. */
    documentName: text('document_name').notNull(),
    actorType: text('actor_type').$type<ActorType>().notNull(),
    actorId: text('actor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    /** The user's name, or the system source (e.g. „KI-Analyse“). */
    actorName: text('actor_name').notNull(),
    action: text('action').$type<ActivityAction>().notNull(),
    /** Only for `updated`: the changed fields with old and new values. */
    changes: jsonb('changes').$type<ActivityChanges>(),
    batchId: uuid('batch_id').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('documentActivity_documentId_createdAt_idx').on(
      table.documentId,
      table.createdAt,
    ),
    index('documentActivity_createdAt_idx').on(table.createdAt),
    index('documentActivity_actorId_idx').on(table.actorId),
    check(
      'document_activity_actor_type_check',
      sql`${table.actorType} in (${inList(ACTOR_TYPES)})`,
    ),
    check(
      'document_activity_action_check',
      sql`${table.action} in (${inList(ACTIVITY_ACTIONS)})`,
    ),
  ],
)
