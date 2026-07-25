import type { APIRoute } from 'astro'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { document, folder, processingJob } from '@/db/schema/documents'
import { isValidUUID } from '@/lib/api-utils'
import { isUniqueViolation } from '@/lib/db-errors'
import { computeSha256 } from '@/lib/hash'
import { ALLOWED_MIME_TYPES, validateMagicBytes } from '@/lib/file-validation'
import { findDocumentBySha256, type DuplicateDocument } from '@/db/queries'

function duplicateResponse(existing?: DuplicateDocument): Response {
  return new Response(
    JSON.stringify({
      error: 'Ein identisches Dokument ist bereits vorhanden',
      duplicate: existing ?? null,
    }),
    { status: 409, headers: { 'Content-Type': 'application/json' } },
  )
}

export const POST: APIRoute = async ({ request }) => {
  const uploadDir = process.env.UPLOAD_DIR || './uploads'
  const maxFileSizeMB = Number(process.env.MAX_FILE_SIZE_MB || '50')

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültige Formulardaten' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const file = formData.get('file')
  const folderId = formData.get('folderId') as string | null

  if (!file || !(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'Keine Datei hochgeladen' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const ext = ALLOWED_MIME_TYPES[file.type]
  if (!ext) {
    return new Response(
      JSON.stringify({ error: 'Dateityp nicht unterstützt' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (file.size > maxFileSizeMB * 1024 * 1024) {
    return new Response(
      JSON.stringify({
        error: `Datei zu groß (max. ${maxFileSizeMB} MB)`,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (folderId) {
    if (!isValidUUID(folderId)) {
      return new Response(JSON.stringify({ error: 'Ungültige Ordner-ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const [existingFolder] = await db
      .select({ id: folder.id })
      .from(folder)
      .where(eq(folder.id, folderId))
    if (!existingFolder) {
      return new Response(JSON.stringify({ error: 'Ordner nicht gefunden' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  const filename = `${randomUUID()}.${ext}`
  const storagePath = join(uploadDir, filename)

  await mkdir(uploadDir, { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())

  if (!validateMagicBytes(buffer, file.type)) {
    return new Response(
      JSON.stringify({
        error: 'Dateiinhalt stimmt nicht mit dem deklarierten Typ überein',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const sha256 = computeSha256(buffer)

  const duplicate = await findDocumentBySha256(sha256)
  if (duplicate) {
    return duplicateResponse(duplicate)
  }

  try {
    await writeFile(storagePath, buffer)

    const result = await db.transaction(async (tx) => {
      const [doc] = await tx
        .insert(document)
        .values({
          name: file.name,
          mimeType: file.type,
          fileSize: file.size,
          storagePath: filename,
          sha256,
          folderId: folderId || null,
        })
        .returning()

      const [job] = await tx
        .insert(processingJob)
        .values({ documentId: doc.id })
        .returning()

      return { document: doc, processingJobId: job.id }
    })

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    await unlink(storagePath).catch(() => {})

    // Concurrent upload of the same content won the unique index race
    if (isUniqueViolation(error)) {
      return duplicateResponse(await findDocumentBySha256(sha256))
    }

    throw error
  }
}
