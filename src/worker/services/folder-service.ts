import { and, eq, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import { document, folder } from '@/db/schema/documents'

async function findFolderId(name: string): Promise<string | null> {
  const [existing] = await db
    .select({ id: folder.id })
    .from(folder)
    .where(sql`lower(${folder.name}) = ${name.trim().toLowerCase()}`)
    .limit(1)
  return existing?.id ?? null
}

/** Only fills an empty folder, so a folder set manually meanwhile wins. */
async function assignFolder(documentId: string, folderId: string) {
  const updated = await db
    .update(document)
    .set({ folderId })
    .where(and(eq(document.id, documentId), isNull(document.folderId)))
    .returning({ id: document.id })
  return updated.length > 0
}

export async function applyFolderSuggestion(
  doc: { id: string; folderId: string | null },
  folderSuggestion: string,
) {
  try {
    // Skip if document already has a folder assigned
    if (doc.folderId !== null) return

    const folderId = await findFolderId(folderSuggestion)
    if (!folderId) {
      console.log(
        `Ordnervorschlag "${folderSuggestion}" für Dokument ${doc.id} — kein passender Ordner gefunden`,
      )
    } else if (await assignFolder(doc.id, folderId)) {
      console.log(
        `Ordner "${folderSuggestion}" zugewiesen für Dokument ${doc.id}`,
      )
    } else {
      console.log(
        `Ordner für Dokument ${doc.id} bereits gesetzt — Vorschlag "${folderSuggestion}" verworfen`,
      )
    }
  } catch (error) {
    console.warn(
      `Ordner konnte nicht zugewiesen werden für Dokument ${doc.id}:`,
      error instanceof Error ? error.message : String(error),
    )
  }
}
