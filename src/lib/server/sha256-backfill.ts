import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import { findDocumentBySha256 } from '@/db/queries'
import { document } from '@/db/schema/documents'
import { isEnoent, safePathOrNull } from '@/lib/api-utils'
import { isUniqueViolation } from '@/lib/db-errors'
import { computeFileSha256 } from '@/lib/hash'

const LOG_PREFIX = '[Backfill]'

interface PendingDocument {
  id: string
  name: string
  storagePath: string
}

/** What happened to one document; also the keys of the summary counters. */
type Outcome =
  'updated' | 'duplicates' | 'missing' | 'invalidPaths' | 'alreadyHashed'

export type BackfillCounts = Record<Outcome, number>

const label = (doc: PendingDocument) => `"${doc.name}" (${doc.id})`

/** The file's hash, or why the document is skipped. */
async function hashDocumentFile(
  doc: PendingDocument,
  uploadDir: string,
): Promise<{ sha256: string } | { skipped: Outcome }> {
  const filePath = safePathOrNull(uploadDir, doc.storagePath)
  if (!filePath) {
    console.warn(
      `${LOG_PREFIX} Ungültiger Speicherpfad, übersprungen: ${label(doc)} -> ${doc.storagePath}`,
    )
    return { skipped: 'invalidPaths' }
  }
  try {
    return { sha256: await computeFileSha256(filePath) }
  } catch (err: unknown) {
    if (isEnoent(err))
      console.warn(
        `${LOG_PREFIX} Datei nicht gefunden, übersprungen: ${label(doc)} -> ${filePath}`,
      )
    else
      console.warn(
        `${LOG_PREFIX} Datei nicht lesbar, übersprungen: ${label(doc)} -> ${filePath}:`,
        err,
      )
    return { skipped: 'missing' }
  }
}

/**
 * document_sha256_idx ist ein UNIQUE-Index: identische Altbestände
 * kollidieren hier. Betroffene Zeile bleibt ohne Hash.
 */
async function reportDuplicate(doc: PendingDocument, sha256: string) {
  const existing = await findDocumentBySha256(sha256)
  const other = existing
    ? `"${existing.name}" (${existing.id})`
    : `einem anderen Dokument (SHA256 ${sha256})`
  console.warn(
    `${LOG_PREFIX} Duplikat erkannt: ${label(doc)} ist inhaltsgleich mit ${other}. ` +
      `SHA256 bleibt leer – bitte eines der beiden Dokumente manuell entfernen und den Backfill erneut ausführen.`,
  )
}

async function storeHash(
  doc: PendingDocument,
  sha256: string,
): Promise<Outcome> {
  try {
    // updated_at wird per SQL auf sich selbst gesetzt: das unterdrückt den
    // $onUpdate-Hook, damit der technische Backfill den Änderungszeitstempel
    // nicht verfälscht (und vermeidet eine Zeitzonen-Konvertierung in JS).
    const [row] = await db
      .update(document)
      .set({ sha256, updatedAt: sql`${document.updatedAt}` })
      .where(and(eq(document.id, doc.id), isNull(document.sha256)))
      .returning({ id: document.id })
    if (!row) {
      console.log(
        `${LOG_PREFIX} Hash zwischenzeitlich gesetzt, übersprungen: ${label(doc)}`,
      )
      return 'alreadyHashed'
    }
    console.log(`${LOG_PREFIX} Hash gesetzt: ${label(doc)} -> ${sha256}`)
    return 'updated'
  } catch (err: unknown) {
    if (!isUniqueViolation(err)) throw err
    await reportDuplicate(doc, sha256)
    return 'duplicates'
  }
}

async function backfillDocument(
  doc: PendingDocument,
  uploadDir: string,
): Promise<Outcome> {
  const hash = await hashDocumentFile(doc, uploadDir)
  return 'sha256' in hash ? storeHash(doc, hash.sha256) : hash.skipped
}

/** The closing summary; optional counters only when they occurred. */
export function backfillSummary(counts: BackfillCounts): string[] {
  const line = (text: string, count: number) =>
    `${LOG_PREFIX} ${text.padEnd(24)}${count}`
  return [
    `${LOG_PREFIX} --- Zusammenfassung ---`,
    line('Hash gesetzt:', counts.updated),
    line('Duplikate übersprungen:', counts.duplicates),
    line('Dateien fehlen:', counts.missing),
    ...(counts.invalidPaths > 0
      ? [line('Ungültige Pfade:', counts.invalidPaths)]
      : []),
    ...(counts.alreadyHashed > 0
      ? [line('Bereits gehasht:', counts.alreadyHashed)]
      : []),
    ...(counts.duplicates > 0
      ? [
          `${LOG_PREFIX} Hinweis: Dokumente ohne Hash werden bei künftigen Uploads nicht als Duplikat erkannt.`,
        ]
      : []),
  ]
}

/**
 * Hashes every document without SHA-256 so dedup also covers the old
 * library. storage_path ist der reine Dateiname innerhalb von UPLOAD_DIR.
 */
export async function backfillSha256(uploadDir: string): Promise<void> {
  const pending = await db
    .select({
      id: document.id,
      name: document.name,
      storagePath: document.storagePath,
    })
    .from(document)
    .where(isNull(document.sha256))
    .orderBy(document.createdAt)

  if (pending.length === 0) {
    console.log(`${LOG_PREFIX} Keine Dokumente ohne SHA256-Hash gefunden.`)
    return
  }
  console.log(
    `${LOG_PREFIX} ${pending.length} Dokument(e) ohne SHA256-Hash gefunden (Upload-Verzeichnis: ${uploadDir}).`,
  )

  const counts: BackfillCounts = {
    updated: 0,
    duplicates: 0,
    missing: 0,
    invalidPaths: 0,
    alreadyHashed: 0,
  }
  for (const doc of pending) counts[await backfillDocument(doc, uploadDir)]++
  for (const line of backfillSummary(counts)) console.log(line)
}
