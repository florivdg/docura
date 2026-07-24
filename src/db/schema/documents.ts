import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  date,
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  index,
  uniqueIndex,
  vector,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core'

export const folder = pgTable(
  'folder',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    parentId: uuid('parent_id').references((): any => folder.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('folder_parentId_idx').on(table.parentId),
    check('folder_no_self_parent', sql`${table.parentId} != ${table.id}`),
  ],
)

export const correspondent = pgTable(
  'correspondent',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  // Case-insensitive uniqueness: prevents 'Acme' and 'ACME' from coexisting,
  // so concurrent find-or-create races always collapse onto one row.
  (table) => [
    uniqueIndex('correspondent_name_lower_idx').on(sql`lower(${table.name})`),
  ],
)

export const document = pgTable(
  'document',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    storagePath: text('storage_path').notNull(),
    sha256: text('sha256'),
    folderId: uuid('folder_id').references(() => folder.id, {
      onDelete: 'set null',
    }),
    correspondentId: uuid('correspondent_id').references(
      () => correspondent.id,
      { onDelete: 'set null' },
    ),
    documentDate: date('document_date', { mode: 'string' }),
    embedding: vector('embedding', { dimensions: 1024 }),
    textContent: text('text_content'),
    isFavorite: boolean('is_favorite').notNull().default(false),
    archivedAt: timestamp('archived_at'),
    trashedAt: timestamp('trashed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('document_folderId_idx').on(table.folderId),
    index('document_correspondentId_idx').on(table.correspondentId),
    index('document_documentDate_idx').on(table.documentDate),
    uniqueIndex('document_sha256_idx').on(table.sha256),
    index('document_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
    index('document_isFavorite_idx').on(table.isFavorite),
    index('document_trashedAt_idx').on(table.trashedAt),
    index('document_archivedAt_idx').on(table.archivedAt),
  ],
)

export const tag = pgTable('tag', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull(),
})

export const documentTag = pgTable(
  'document_tag',
  {
    documentId: uuid('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.tagId] }),
    index('documentTag_tagId_idx').on(table.tagId),
  ],
)

export const processingJob = pgTable(
  'processing_job',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => document.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    step: text('step'),
    errorMessage: text('error_message'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    nextRetryAt: timestamp('next_retry_at'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('processingJob_documentId_idx').on(table.documentId),
    index('processingJob_status_idx').on(table.status),
    index('processingJob_status_nextRetryAt_idx').on(
      table.status,
      table.nextRetryAt,
    ),
  ],
)

export const folderRelations = relations(folder, ({ one, many }) => ({
  parent: one(folder, {
    fields: [folder.parentId],
    references: [folder.id],
    relationName: 'folderParent',
  }),
  children: many(folder, { relationName: 'folderParent' }),
  documents: many(document),
}))

export const documentRelations = relations(document, ({ one, many }) => ({
  folder: one(folder, {
    fields: [document.folderId],
    references: [folder.id],
  }),
  correspondent: one(correspondent, {
    fields: [document.correspondentId],
    references: [correspondent.id],
  }),
  documentTags: many(documentTag),
  processingJobs: many(processingJob),
}))

export const correspondentRelations = relations(correspondent, ({ many }) => ({
  documents: many(document),
}))

export const tagRelations = relations(tag, ({ many }) => ({
  documentTags: many(documentTag),
}))

export const documentTagRelations = relations(documentTag, ({ one }) => ({
  document: one(document, {
    fields: [documentTag.documentId],
    references: [document.id],
  }),
  tag: one(tag, {
    fields: [documentTag.tagId],
    references: [tag.id],
  }),
}))

export const processingJobRelations = relations(processingJob, ({ one }) => ({
  document: one(document, {
    fields: [processingJob.documentId],
    references: [document.id],
  }),
}))
