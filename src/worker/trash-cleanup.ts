import { db } from '@/db'
import { SYSTEM_ACTORS } from '@/db/activity'
import { document } from '@/db/schema/documents'
import { lt } from 'drizzle-orm'
import { removeDocumentsPermanently } from '@/lib/server/document-removal'
import { WORKER_CONFIG } from '@/worker/config'

export async function cleanupTrash(now = new Date()): Promise<number> {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - WORKER_CONFIG.trashRetentionDays)
  return removeDocumentsPermanently(
    db,
    lt(document.trashedAt, cutoff),
    WORKER_CONFIG.uploadDir,
    SYSTEM_ACTORS.trashCleanup,
  )
}
