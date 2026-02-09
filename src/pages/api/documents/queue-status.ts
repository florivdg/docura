import type { APIRoute } from 'astro'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/db'
import { processingJob } from '@/db/schema/documents'

export const GET: APIRoute = async ({ url }) => {
  const documentId = url.searchParams.get('documentId')

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
