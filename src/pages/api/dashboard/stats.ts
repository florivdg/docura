import type { APIRoute } from 'astro'
import { db } from '@/db'
import { document, folder, tag } from '@/db/schema/documents'
import { and, count, desc, eq, isNotNull, sum } from 'drizzle-orm'
import { activeDocumentConditions } from '@/db/queries'

export const GET: APIRoute = async () => {
  const activeConditions = activeDocumentConditions()

  const [
    docStats,
    folderStats,
    tagStats,
    typeBreakdown,
    trashedStats,
    archivedStats,
    favoritesStats,
  ] = await Promise.all([
    db
      .select({
        documentCount: count(),
        totalStorageBytes: sum(document.fileSize),
      })
      .from(document)
      .where(and(...activeConditions))
      .then((r) => r[0]!),

    db
      .select({ folderCount: count() })
      .from(folder)
      .then((r) => r[0]!),

    db
      .select({ tagCount: count() })
      .from(tag)
      .then((r) => r[0]!),

    // Documents grouped by MIME type (active only)
    db
      .select({
        mimeType: document.mimeType,
        count: count(),
        totalSize: sum(document.fileSize),
      })
      .from(document)
      .where(and(...activeConditions))
      .groupBy(document.mimeType)
      .orderBy(desc(count())),

    db
      .select({ count: count() })
      .from(document)
      .where(isNotNull(document.trashedAt))
      .then((r) => r[0]!),

    db
      .select({ count: count() })
      .from(document)
      .where(isNotNull(document.archivedAt))
      .then((r) => r[0]!),

    db
      .select({ count: count() })
      .from(document)
      .where(and(...activeConditions, eq(document.isFavorite, true)))
      .then((r) => r[0]!),
  ])

  return new Response(
    JSON.stringify({
      stats: {
        documentCount: docStats.documentCount,
        folderCount: folderStats.folderCount,
        tagCount: tagStats.tagCount,
        totalStorageBytes: Number(docStats.totalStorageBytes ?? 0),
        trashedCount: trashedStats.count,
        archivedCount: archivedStats.count,
        favoritesCount: favoritesStats.count,
      },
      documentsByType: typeBreakdown.map((r) => ({
        mimeType: r.mimeType,
        count: r.count,
        totalSize: Number(r.totalSize ?? 0),
      })),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
