import type { APIRoute } from 'astro'
import { db } from '@/db'
import { document } from '@/db/schema/documents'
import { eq } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { isValidUUID, safePath } from '@/lib/api-utils'

export const GET: APIRoute = async ({ params, url }) => {
  const { id } = params

  if (!id || !isValidUUID(id)) {
    return new Response(JSON.stringify({ error: 'Ungültige Dokument-ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const [doc] = await db
    .select()
    .from(document)
    .where(eq(document.id, id))
    .limit(1)

  if (!doc) {
    return new Response(JSON.stringify({ error: 'Dokument nicht gefunden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const uploadDir = process.env.UPLOAD_DIR || './uploads'
  let filePath: string
  try {
    filePath = safePath(uploadDir, doc.storagePath)
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiger Dateipfad' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let buffer: Buffer
  try {
    buffer = await readFile(filePath)
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return new Response(JSON.stringify({ error: 'Datei nicht gefunden' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw err
  }

  const headers: Record<string, string> = {
    'Content-Type': doc.mimeType,
    'X-Content-Type-Options': 'nosniff',
  }

  if (url.searchParams.get('download') === 'true') {
    headers['Content-Disposition'] =
      `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`
  } else {
    headers['Content-Disposition'] = 'inline'
  }

  return new Response(new Uint8Array(buffer), { headers })
}
