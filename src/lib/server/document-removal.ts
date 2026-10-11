import { and, asc, inArray, isNotNull, type SQL } from 'drizzle-orm'
import { unlink } from 'node:fs/promises'
import type { db as appDb } from '@/db'
import { documentActivities, recordActivities } from '@/db/activity'
import { document } from '@/db/schema/documents'
import type { ActivityActor } from '@/lib/activity'
import { isEnoent, safePath } from '@/lib/api-utils'
import { mapConcurrent } from '@/lib/concurrency'

type Database = Pick<typeof appDb, 'transaction'>

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
 * Deletes the rows and records one `deleted` entry per document (one batch)
 * in the same transaction. The entries carry no document id: the row is gone,
 * and its earlier entries lose theirs through ON DELETE SET NULL. The
 * subquery locks the rows in id order like `withActivity` (bulk actions), so
 * emptying the trash and a concurrent bulk restore wait for each other
 * instead of deadlocking; as a subquery it needs no bind parameter per id.
 */
function deleteRows(db: Database, where: SQL, actor: ActivityActor) {
  return db.transaction(async (tx) => {
    const locked = tx
      .select({ id: document.id })
      .from(document)
      .where(and(where, isNotNull(document.trashedAt)))
      .orderBy(asc(document.id))
      .for('update')
    const removed = await tx
      .delete(document)
      .where(inArray(document.id, locked))
      .returning({ name: document.name, storagePath: document.storagePath })
    await recordActivities(
      tx,
      documentActivities(
        removed.map(({ name }) => ({ id: null, name })),
        actor,
        'deleted',
      ),
    )
    return removed
  })
}

/**
 * Permanently removes the trashed documents matching `where`: one DELETE for
 * the rows first, the files after the commit. A crash in between leaves an
 * invisible orphan file (reclaimed by `storage:check --delete-orphans`)
 * instead of a visible row without file. Documents that are not (or no
 * longer) in the trash are never removed. Resolves to the number of removed
 * documents.
 */
export async function removeDocumentsPermanently(
  db: Database,
  where: SQL,
  uploadDir: string,
  actor: ActivityActor,
): Promise<number> {
  const removed = await deleteRows(db, where, actor)
  await mapConcurrent(removed, UNLINK_CONCURRENCY, ({ storagePath }) =>
    removeFile(uploadDir, storagePath),
  )
  return removed.length
}
