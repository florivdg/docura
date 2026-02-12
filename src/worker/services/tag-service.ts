import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { documentTag, tag } from '@/db/schema/documents'

export async function findOrCreateTag(
  tagName: string,
): Promise<{ id: string } | null> {
  const lowerName = tagName.trim().toLowerCase()

  // Case-insensitive search for existing tag
  const existing = await db
    .select({ id: tag.id })
    .from(tag)
    .where(sql`lower(${tag.name}) = ${lowerName}`)
    .limit(1)

  if (existing.length > 0) return existing[0]

  // Create new tag
  try {
    const [created] = await db
      .insert(tag)
      .values({ name: tagName.trim() })
      .returning({ id: tag.id })
    return created
  } catch {
    // Unique constraint violation (race condition) — retry search
    const retry = await db
      .select({ id: tag.id })
      .from(tag)
      .where(sql`lower(${tag.name}) = ${lowerName}`)
      .limit(1)
    if (retry.length > 0) return retry[0]

    console.warn(`Tag "${tagName}" konnte nicht erstellt werden`)
    return null
  }
}

export async function applyTags(documentId: string, tagNames: string[]) {
  try {
    const tagIds: string[] = []
    for (const name of tagNames) {
      const result = await findOrCreateTag(name)
      if (result) tagIds.push(result.id)
    }

    if (tagIds.length > 0) {
      await db
        .insert(documentTag)
        .values(tagIds.map((tagId) => ({ documentId, tagId })))
        .onConflictDoNothing()
      console.log(
        `${tagIds.length} Tag(s) zugewiesen für Dokument ${documentId}`,
      )
    }
  } catch (error) {
    console.warn(
      `Tags konnten nicht zugewiesen werden für Dokument ${documentId}:`,
      error instanceof Error ? error.message : String(error),
    )
  }
}
