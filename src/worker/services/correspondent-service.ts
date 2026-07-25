import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { document } from '@/db/schema/documents'
import { findOrCreateCorrespondent } from '@/lib/correspondents'

export async function applyCorrespondent(
  doc: { id: string; correspondentId: string | null },
  correspondentName: string,
) {
  try {
    // Skip if document already has a correspondent assigned
    if (doc.correspondentId !== null) return

    const result = await findOrCreateCorrespondent(correspondentName)
    if (!result) {
      console.warn(
        `Korrespondent "${correspondentName}" konnte nicht erstellt werden`,
      )
      return
    }

    // Only fill an empty Korrespondent — never overwrite a manually assigned one
    const updated = await db
      .update(document)
      .set({ correspondentId: result.correspondent.id })
      .where(and(eq(document.id, doc.id), isNull(document.correspondentId)))
      .returning({ id: document.id })

    if (updated.length > 0) {
      console.log(
        `Korrespondent "${correspondentName}" zugewiesen für Dokument ${doc.id}`,
      )
    } else {
      console.log(
        `Korrespondent für Dokument ${doc.id} bereits gesetzt — Vorschlag "${correspondentName}" verworfen`,
      )
    }
  } catch (error) {
    console.warn(
      `Korrespondent konnte nicht zugewiesen werden für Dokument ${doc.id}:`,
      error instanceof Error ? error.message : String(error),
    )
  }
}
