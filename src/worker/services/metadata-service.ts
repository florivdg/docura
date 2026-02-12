import { db } from '@/db'
import { folder, tag } from '@/db/schema/documents'

export async function loadExistingMetadata() {
  const existingTags = await db.select({ id: tag.id, name: tag.name }).from(tag)
  const existingFolders = await db
    .select({ id: folder.id, name: folder.name })
    .from(folder)
  return { existingTags, existingFolders }
}
