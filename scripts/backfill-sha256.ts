#!/usr/bin/env bun
import { and, eq, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import { findDocumentBySha256 } from '@/db/queries'
import { document } from '@/db/schema/documents'
import { isEnoent, safePath } from '@/lib/api-utils'
import { isUniqueViolation } from '@/lib/db-errors'
import { computeFileSha256 } from '@/lib/hash'

const LOG_PREFIX = '[Backfill]'

async function main(): Promise<void> {
  // Gleiche Auflösung wie Upload-Route und Watcher: storage_path ist der
  // reine Dateiname innerhalb von UPLOAD_DIR.
  const uploadDir = process.env.UPLOAD_DIR || './uploads'

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

  let updated = 0
  let duplicates = 0
  let missing = 0
  let invalidPaths = 0
  let alreadyHashed = 0

  for (const doc of pending) {
    let filePath: string
    try {
      filePath = safePath(uploadDir, doc.storagePath)
    } catch {
      invalidPaths++
      console.warn(
        `${LOG_PREFIX} Ungültiger Speicherpfad, übersprungen: "${doc.name}" (${doc.id}) -> ${doc.storagePath}`,
      )
      continue
    }

    let sha256: string
    try {
      sha256 = await computeFileSha256(filePath)
    } catch (err: unknown) {
      missing++
      if (isEnoent(err)) {
        console.warn(
          `${LOG_PREFIX} Datei nicht gefunden, übersprungen: "${doc.name}" (${doc.id}) -> ${filePath}`,
        )
      } else {
        console.warn(
          `${LOG_PREFIX} Datei nicht lesbar, übersprungen: "${doc.name}" (${doc.id}) -> ${filePath}:`,
          err,
        )
      }
      continue
    }

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
        alreadyHashed++
        console.log(
          `${LOG_PREFIX} Hash zwischenzeitlich gesetzt, übersprungen: "${doc.name}" (${doc.id})`,
        )
        continue
      }

      updated++
      console.log(
        `${LOG_PREFIX} Hash gesetzt: "${doc.name}" (${doc.id}) -> ${sha256}`,
      )
    } catch (err: unknown) {
      // document_sha256_idx ist ein UNIQUE-Index: identische Altbestände
      // kollidieren hier. Betroffene Zeile bleibt ohne Hash.
      if (isUniqueViolation(err)) {
        duplicates++
        const existing = await findDocumentBySha256(sha256)
        const other = existing
          ? `"${existing.name}" (${existing.id})`
          : `einem anderen Dokument (SHA256 ${sha256})`
        console.warn(
          `${LOG_PREFIX} Duplikat erkannt: "${doc.name}" (${doc.id}) ist inhaltsgleich mit ${other}. ` +
            `SHA256 bleibt leer – bitte eines der beiden Dokumente manuell entfernen und den Backfill erneut ausführen.`,
        )
        continue
      }

      throw err
    }
  }

  const summaryLine = (label: string, count: number) =>
    `${LOG_PREFIX} ${label.padEnd(24)}${count}`

  console.log(`${LOG_PREFIX} --- Zusammenfassung ---`)
  console.log(summaryLine('Hash gesetzt:', updated))
  console.log(summaryLine('Duplikate übersprungen:', duplicates))
  console.log(summaryLine('Dateien fehlen:', missing))
  if (invalidPaths > 0) {
    console.log(summaryLine('Ungültige Pfade:', invalidPaths))
  }
  if (alreadyHashed > 0) {
    console.log(summaryLine('Bereits gehasht:', alreadyHashed))
  }

  if (duplicates > 0) {
    console.log(
      `${LOG_PREFIX} Hinweis: Dokumente ohne Hash werden bei künftigen Uploads nicht als Duplikat erkannt.`,
    )
  }
}

void main()
  .then(async () => {
    await db.$client.end()
  })
  .catch(async (error: unknown) => {
    console.error(`${LOG_PREFIX} Abbruch durch schwerwiegenden Fehler:`, error)
    await db.$client.end().catch(() => {})
    process.exit(1)
  })
