import type { SQL } from 'drizzle-orm'
import { eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import { document, processingJob } from '@/db/schema/documents'

export function activeDocumentConditions(): SQL[] {
  return [isNull(document.trashedAt), isNull(document.archivedAt)]
}

export function viewConditions(view: string): SQL[] {
  switch (view) {
    case 'favorites':
      return [...activeDocumentConditions(), eq(document.isFavorite, true)]
    case 'trash':
      return [isNotNull(document.trashedAt)]
    case 'archive':
      return [isNotNull(document.archivedAt), isNull(document.trashedAt)]
    default:
      return activeDocumentConditions()
  }
}

export type DuplicateDocument = {
  id: string
  name: string
  trashedAt: Date | null
}

/** Findet das Dokument, das den Inhalts-Hash bereits belegt (Dedup). */
export async function findDocumentBySha256(
  sha256: string,
): Promise<DuplicateDocument | undefined> {
  const [existing] = await db
    .select({
      id: document.id,
      name: document.name,
      trashedAt: document.trashedAt,
    })
    .from(document)
    .where(eq(document.sha256, sha256))
    .limit(1)

  return existing
}

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
