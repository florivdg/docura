import { and, asc, eq, inArray, or, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import {
  documentListCondition,
  filtersByStatus,
  loadTagsForDocuments,
  withLatestJob,
} from '@/db/document-list'
import { viewConditions } from '@/db/queries'
import { correspondent, document, folder } from '@/db/schema/documents'
import type { ExportSelection } from '@/lib/document-export-request'
import type { ExportDocumentRow } from '@/lib/export-metadata'
import type { ExportSource } from '@/lib/server/export-zip'

/** Matching document ids, oldest first; at most `limit` when given. */
async function documentIds(
  where: SQL | undefined,
  joinLatestJob: boolean,
  limit?: number,
): Promise<string[]> {
  const base = db.select({ id: document.id }).from(document).$dynamic()
  const query = (joinLatestJob ? withLatestJob(base) : base)
    .where(where)
    .orderBy(asc(document.createdAt), asc(document.id))
  const rows = await (limit === undefined ? query : query.limit(limit))
  return rows.map((row) => row.id)
}

/**
 * Ids of a web export: the explicitly selected documents, or everything the
 * list shows for the view, filters and full-text query.
 */
export function exportDocumentIds(
  selection: ExportSelection,
  limit?: number,
): Promise<string[]> {
  if (selection.ids)
    return documentIds(inArray(document.id, selection.ids), false, limit)
  return documentIds(
    documentListCondition(selection.filters, selection.query),
    filtersByStatus(selection.filters),
    limit,
  )
}

/** Ids of the CLI export: the active library plus the opted-in views. */
export function libraryDocumentIds(options: {
  includeArchived: boolean
  includeTrash: boolean
}): Promise<string[]> {
  const views = [
    'all',
    ...(options.includeArchived ? ['archive'] : []),
    ...(options.includeTrash ? ['trash'] : []),
  ]
  const where = or(...views.map((view) => and(...viewConditions(view))))
  return documentIds(where, false)
}

async function loadRows(ids: string[]): Promise<ExportDocumentRow[]> {
  const [rows, tagsByDoc] = await Promise.all([
    db
      .select({
        id: document.id,
        name: document.name,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        storagePath: document.storagePath,
        sha256: document.sha256,
        folderId: document.folderId,
        correspondent: correspondent.name,
        documentDate: document.documentDate,
        isFavorite: document.isFavorite,
        archivedAt: document.archivedAt,
        trashedAt: document.trashedAt,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      })
      .from(document)
      .leftJoin(correspondent, eq(document.correspondentId, correspondent.id))
      .where(inArray(document.id, ids))
      .orderBy(asc(document.createdAt), asc(document.id)),
    loadTagsForDocuments(ids),
  ])
  return rows.map((row) => ({
    ...row,
    tags: (tagsByDoc.get(row.id) ?? []).map(({ name, color }) => ({
      name,
      color,
    })),
  }))
}

async function loadTexts(ids: string[]) {
  const rows = await db
    .select({ id: document.id, textContent: document.textContent })
    .from(document)
    .where(inArray(document.id, ids))
  return new Map(rows.map((row) => [row.id, row.textContent]))
}

/** Export source backed by the database; folders are loaded once. */
export async function databaseExportSource(
  ids: string[],
): Promise<ExportSource> {
  const folders = await db
    .select({ id: folder.id, name: folder.name, parentId: folder.parentId })
    .from(folder)
  return { ids, folders, loadRows, loadTexts }
}
