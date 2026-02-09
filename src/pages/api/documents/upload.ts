import type { APIRoute } from 'astro'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { document, folder, processingJob } from '@/db/schema/documents'

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/tiff': 'tiff',
}

export const POST: APIRoute = async ({ request }) => {
  const uploadDir = process.env.UPLOAD_DIR || './uploads'
  const maxFileSizeMB = Number(process.env.MAX_FILE_SIZE_MB || '50')

  const formData = await request.formData()
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
