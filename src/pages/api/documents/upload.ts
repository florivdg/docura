import type { APIRoute } from 'astro'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { document, folder, processingJob } from '@/db/schema/documents'
import { isValidUUID } from '@/lib/api-utils'

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/tiff': 'tiff',
}

const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }], // .PNG
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }], // FFD8FF
  'image/webp': [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
  ],
  'image/tiff': [
    { offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] }, // II*.
  ],
}

const MAGIC_BYTES_TIFF_BE = [0x4d, 0x4d, 0x00, 0x2a] // MM.*

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType]
  if (!signatures) return true // no signature to check

  if (mimeType === 'image/tiff') {
    const matchesLE = signatures[0].bytes.every(
      (b, i) => buffer[signatures[0].offset + i] === b,
    )
    const matchesBE = MAGIC_BYTES_TIFF_BE.every((b, i) => buffer[i] === b)
    return matchesLE || matchesBE
  }

  return signatures.every((sig) =>
    sig.bytes.every((b, i) => buffer[sig.offset + i] === b),
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
    throw error
  }
}
