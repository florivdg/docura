import type { APIRoute } from 'astro'
import { db } from '@/db'
import { document, folder, processingJob, tag } from '@/db/schema/documents'
import { count, desc, eq, sql, sum } from 'drizzle-orm'
import { latestJobPerDoc } from '@/db/queries'

export const GET: APIRoute = async () => {
  const latestJob = latestJobPerDoc()

  const [docStats, folderStats, tagStats, recentDocs, typeBreakdown] =
    await Promise.all([
      db
        .select({
          documentCount: count(),
          totalStorageBytes: sum(document.fileSize),
        })
        .from(document)
        .then((r) => r[0]!),

      db
        .select({ folderCount: count() })
        .from(folder)
        .then((r) => r[0]!),

      db
        .select({ tagCount: count() })
        .from(tag)
        .then((r) => r[0]!),

      // Recent 10 documents with latest processing status
      db
        .select({
          id: document.id,
          name: document.name,
          mimeType: document.mimeType,
          fileSize: document.fileSize,
          createdAt: document.createdAt,
          folderName: folder.name,
          processingStatus: processingJob.status,
        })
        .from(document)
        .leftJoin(folder, eq(document.folderId, folder.id))
        .leftJoin(latestJob, eq(document.id, latestJob.documentId))
        .leftJoin(
          processingJob,
          sql`${processingJob.documentId} = ${latestJob.documentId} AND ${processingJob.createdAt} = ${latestJob.maxCreatedAt}`,
        )
        .orderBy(desc(document.createdAt))
        .limit(10),

      // Documents grouped by MIME type
      db
        .select({
          mimeType: document.mimeType,
          count: count(),
          totalSize: sum(document.fileSize),
        })
        .from(document)
        .groupBy(document.mimeType)
        .orderBy(desc(count())),
    ])

  return new Response(
    JSON.stringify({
      stats: {
        documentCount: docStats.documentCount,
        folderCount: folderStats.folderCount,
        tagCount: tagStats.tagCount,
        totalStorageBytes: Number(docStats.totalStorageBytes ?? 0),
      },
      recentDocuments: recentDocs,
      documentsByType: typeBreakdown.map((r) => ({
        mimeType: r.mimeType,
        count: r.count,
        totalSize: Number(r.totalSize ?? 0),
      })),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
