import type { APIRoute } from 'astro'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/db'
import { processingJob } from '@/db/schema/documents'
import { isValidUUID } from '@/lib/api-utils'

export const GET: APIRoute = async ({ url }) => {
  const documentId = url.searchParams.get('documentId')

  if (documentId && !isValidUUID(documentId)) {
    return new Response(JSON.stringify({ error: 'Ungültige Dokument-ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let jobs
  if (documentId) {
    jobs = await db
      .select()
      .from(processingJob)
      .where(eq(processingJob.documentId, documentId))
      .orderBy(desc(processingJob.createdAt))
  } else {
    jobs = await db
      .select()
      .from(processingJob)
      .orderBy(desc(processingJob.createdAt))
      .limit(20)
  }

  return new Response(JSON.stringify({ jobs }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
