import { db } from '@/db'
import { correspondent, folder, tag } from '@/db/schema/documents'

export async function loadExistingMetadata() {
  const [existingTags, existingFolders, existingCorrespondents] =
    await Promise.all([
      db.select({ id: tag.id, name: tag.name }).from(tag),
      db.select({ id: folder.id, name: folder.name }).from(folder),
      db
        .select({ id: correspondent.id, name: correspondent.name })
        .from(correspondent),
    ])
  return { existingTags, existingFolders, existingCorrespondents }
}
