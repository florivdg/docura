import type { APIRoute } from 'astro'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { document, folder, processingJob } from '@/db/schema/documents'
import { isValidUUID } from '@/lib/api-utils'
import { withApiErrors } from '@/lib/api-errors'
import { ApiValidationError } from '@/lib/api-validation-error'
import { isUniqueViolation } from '@/lib/db-errors'
import { computeSha256 } from '@/lib/hash'
import { ALLOWED_MIME_TYPES, validateMagicBytes } from '@/lib/file-validation'
import { jsonResponse } from '@/lib/json-response'
import { findDocumentBySha256, type DuplicateDocument } from '@/db/queries'
import { STORAGE_CONFIG } from '@/lib/server/storage-config'

interface UploadRequest {
  file: File
  folderId: string | null
  /** File extension for the stored name, from the declared MIME type. */
  ext: string
}

interface StoredUpload {
  file: File
  folderId: string | null
  /** Stored file name inside UPLOAD_DIR. */
  filename: string
  buffer: Buffer
  sha256: string
}

function duplicateResponse(existing?: DuplicateDocument): Response {
  return jsonResponse(
    {
      error: 'Ein identisches Dokument ist bereits vorhanden',
      duplicate: existing ?? null,
    },
    409,
  )
}

async function readFormData(request: Request): Promise<FormData> {
  try {
    return await request.formData()
  } catch {
    throw new ApiValidationError('Ungültige Formulardaten')
  }
}

/** The uploaded file and target folder; invalid input throws a 400. */
async function readUploadRequest(request: Request): Promise<UploadRequest> {
  const maxFileSizeMB = Number(process.env.MAX_FILE_SIZE_MB || '50')
  const formData = await readFormData(request)
  const file = formData.get('file')
  const folderId = formData.get('folderId') as string | null

  if (!file || !(file instanceof File))
    throw new ApiValidationError('Keine Datei hochgeladen')
  const ext = ALLOWED_MIME_TYPES[file.type]
  if (!ext) throw new ApiValidationError('Dateityp nicht unterstützt')
  if (file.size > maxFileSizeMB * 1024 * 1024)
    throw new ApiValidationError(`Datei zu groß (max. ${maxFileSizeMB} MB)`)
  return { file, folderId, ext }
}

async function assertFolderExists(folderId: string | null): Promise<void> {
  if (!folderId) return
  if (!isValidUUID(folderId))
    throw new ApiValidationError('Ungültige Ordner-ID')
  const [existingFolder] = await db
    .select({ id: folder.id })
    .from(folder)
    .where(eq(folder.id, folderId))
  if (!existingFolder) throw new ApiValidationError('Ordner nicht gefunden')
}

/** Writes the file, then the document row and its processing job. */
async function storeUpload(
  upload: StoredUpload,
  uploadDir: string,
): Promise<Response> {
  const { file, folderId, filename, buffer, sha256 } = upload
  const storagePath = join(uploadDir, filename)
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

    return jsonResponse(result, 201)
  } catch (error) {
    await unlink(storagePath).catch(() => {})

    // Concurrent upload of the same content won the unique index race
    if (isUniqueViolation(error)) {
      return duplicateResponse(await findDocumentBySha256(sha256))
    }

    throw error
  }
}

export const POST: APIRoute = ({ request }) =>
  withApiErrors(async () => {
    const uploadDir = STORAGE_CONFIG.uploadDir
    const { file, folderId, ext } = await readUploadRequest(request)
    await assertFolderExists(folderId)

    await mkdir(uploadDir, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    if (!validateMagicBytes(buffer, file.type))
      throw new ApiValidationError(
        'Dateiinhalt stimmt nicht mit dem deklarierten Typ überein',
      )

    const sha256 = computeSha256(buffer)
    const duplicate = await findDocumentBySha256(sha256)
    if (duplicate) return duplicateResponse(duplicate)

    const filename = `${randomUUID()}.${ext}`
    return storeUpload({ file, folderId, filename, buffer, sha256 }, uploadDir)
  })
