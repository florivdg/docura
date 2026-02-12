import { eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { document, folder } from '@/db/schema/documents'

export async function applyFolderSuggestion(
  doc: { id: string; folderId: string | null },
  folderSuggestion: string,
) {
  try {
    // Skip if document already has a folder assigned
    if (doc.folderId !== null) return

    const lowerName = folderSuggestion.trim().toLowerCase()
    const existing = await db
      .select({ id: folder.id })
      .from(folder)
      .where(sql`lower(${folder.name}) = ${lowerName}`)
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(document)
        .set({ folderId: existing[0].id })
        .where(eq(document.id, doc.id))
      console.log(
        `Ordner "${folderSuggestion}" zugewiesen für Dokument ${doc.id}`,
      )
    } else {
      console.log(
        `Ordnervorschlag "${folderSuggestion}" für Dokument ${doc.id} — kein passender Ordner gefunden`,
      )
    }
  } catch (error) {
    console.warn(
      `Ordner konnte nicht zugewiesen werden für Dokument ${doc.id}:`,
      error instanceof Error ? error.message : String(error),
    )
  }
}
