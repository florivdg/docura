import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { processingJob } from '@/db/schema/documents'

export function latestJobPerDoc() {
  return db
    .select({
      documentId: processingJob.documentId,
      maxCreatedAt: sql<Date>`max(${processingJob.createdAt})`.as(
        'max_created_at',
      ),
    })
    .from(processingJob)
    .groupBy(processingJob.documentId)
    .as('latest_job')
}
