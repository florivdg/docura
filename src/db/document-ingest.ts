import type { Transaction } from '@/db'
import { documentActivities, recordActivities } from '@/db/activity'
import { document, processingJob } from '@/db/schema/documents'
import type { ActivityActor } from '@/lib/activity'

/**
 * The shared write of both ingest paths (upload API and watch folder): the
 * document row, its processing job and its `uploaded` activity.
 */
export async function insertUploadedDocument(
  tx: Transaction,
  values: typeof document.$inferInsert,
  actor: ActivityActor,
) {
  const [doc] = await tx.insert(document).values(values).returning()
  const [job] = await tx
    .insert(processingJob)
    .values({ documentId: doc.id })
    .returning()
  await recordActivities(
    tx,
    documentActivities([{ id: doc.id, name: values.name }], actor, 'uploaded'),
  )
  return { document: doc, processingJobId: job.id }
}
