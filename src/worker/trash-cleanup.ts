import { db } from '@/db'
import { document } from '@/db/schema/documents'
import { inArray, lt } from 'drizzle-orm'
import { unlink } from 'node:fs/promises'
import { safePath } from '@/lib/api-utils'
import { WORKER_CONFIG } from '@/worker/config'

export async function cleanupTrash(): Promise<number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - WORKER_CONFIG.trashRetentionDays)

  const expiredDocs = await db
    .select({ id: document.id, storagePath: document.storagePath })
    .from(document)
    .where(lt(document.trashedAt, cutoff))

  if (expiredDocs.length === 0) return 0

  const uploadDir = WORKER_CONFIG.uploadDir

  for (const doc of expiredDocs) {
    try {
      const filePath = safePath(uploadDir, doc.storagePath)
      await unlink(filePath)
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  const ids = expiredDocs.map((d) => d.id)
  await db.delete(document).where(inArray(document.id, ids))

  return expiredDocs.length
}
