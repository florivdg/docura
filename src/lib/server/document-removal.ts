import { and, isNotNull, type SQL } from 'drizzle-orm'
import { unlink } from 'node:fs/promises'
import type { db as appDb } from '@/db'
import { document } from '@/db/schema/documents'
import { isEnoent, safePath } from '@/lib/api-utils'
import { mapConcurrent } from '@/lib/concurrency'

type Database = Pick<typeof appDb, 'delete'>

/** Parallel unlinks after a large deletion such as emptying the trash. */
const UNLINK_CONCURRENCY = 8

async function removeFile(uploadDir: string, storagePath: string) {
  try {
    await unlink(safePath(uploadDir, storagePath))
  } catch (err) {
    if (isEnoent(err)) return
    // The row is gone already; `storage:check` reports the orphan file.
    console.error(`Datei konnte nicht gelöscht werden: ${storagePath}`, err)
  }
}

/**
 * Permanently removes the trashed documents matching `where`: one DELETE for
 * the rows first, the files second. A crash in between leaves an invisible
 * orphan file (reclaimed by `storage:check --delete-orphans`) instead of a
 * visible row without file. Documents that are not (or no longer) in the
 * trash are never removed. Resolves to the number of removed documents.
 */
export async function removeDocumentsPermanently(
  db: Database,
  where: SQL,
  uploadDir: string,
): Promise<number> {
  const removed = await db
    .delete(document)
    .where(and(where, isNotNull(document.trashedAt)))
    .returning({ storagePath: document.storagePath })
  await mapConcurrent(removed, UNLINK_CONCURRENCY, ({ storagePath }) =>
    removeFile(uploadDir, storagePath),
  )
  return removed.length
}
