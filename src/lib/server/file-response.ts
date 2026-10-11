import { createReadStream } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { safePathOrNull, statFile } from '@/lib/api-utils'
import {
  contentDisposition,
  entityTag,
  etagMatches,
  parseRange,
  type ByteRange,
} from '@/lib/http-headers'
import { jsonResponse } from '@/lib/json-response'

export interface FileResponseOptions {
  mimeType: string
  /** Original file name for `Content-Disposition`. */
  name: string
  sha256: string | null
  disposition: 'inline' | 'attachment'
  rangeHeader?: string | null
  ifNoneMatch?: string | null
  ifRange?: string | null
}

/** Streams `path` (or a slice of it) without buffering the file. */
function fileStream(path: string, range?: ByteRange): ReadableStream {
  return Readable.toWeb(
    createReadStream(path, range),
  ) as unknown as ReadableStream
}

/** Errors that make a stored file unavailable rather than the export broken. */
const UNAVAILABLE_FILE_CODES = new Set([
  'ENOENT',
  'ENOTDIR',
  'EACCES',
  'EISDIR',
])

async function openFile(path: string): Promise<FileHandle | null> {
  try {
    return await open(path, 'r')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code
    if (code && UNAVAILABLE_FILE_CODES.has(code)) return null
    throw err
  }
}

export interface OpenStoredFile {
  stream: ReadableStream
  /** Closes the file; call it once the stream is consumed or abandoned. */
  close: () => Promise<void>
}

/**
 * Opens a stored document file for streaming, or `null` when the storage
 * path escapes `uploadDir` or the file is missing, unreadable or not a
 * regular file. The stream reads from the open handle, so deleting the file
 * afterwards (trash cleanup) cannot break it.
 */
export async function openStoredFile(
  uploadDir: string,
  storagePath: string,
): Promise<OpenStoredFile | null> {
  const path = safePathOrNull(uploadDir, storagePath)
  const handle = path ? await openFile(path) : null
  if (!handle) return null
  const close = () => handle.close().catch(() => {})
  try {
    if ((await handle.stat()).isFile()) {
      const reader = handle.createReadStream({ autoClose: false })
      return {
        stream: Readable.toWeb(reader) as unknown as ReadableStream,
        close,
      }
    }
  } catch (err) {
    await close()
    throw err
  }
  await close()
  return null
}

/**
 * The requested range, unless `If-Range` names another version. `If-Range`
 * uses the strong comparison: a weak ETag never matches (RFC 9110 13.1.5).
 */
function requestedRange(
  options: FileResponseOptions,
  size: number,
  etag: string,
) {
  const { ifRange } = options
  if (ifRange && (etag.startsWith('W/') || ifRange.trim() !== etag)) return null
  return parseRange(options.rangeHeader ?? null, size)
}

/**
 * Serves a stored document with validators and single-range support:
 * 200 full file, 206 partial, 304 for a matching `If-None-Match`, 416 for an
 * unsatisfiable range and a JSON 404 when the file is missing.
 */
export async function fileResponse(
  path: string,
  options: FileResponseOptions,
): Promise<Response> {
  const stats = await statFile(path)
  if (!stats) return jsonResponse({ error: 'Datei nicht gefunden' }, 404)

  const size = stats.size
  const etag = entityTag(options.sha256, size, stats.mtimeMs)
  const headers: Record<string, string> = {
    'Accept-Ranges': 'bytes',
    ETag: etag,
    'Last-Modified': stats.mtime.toUTCString(),
    'Cache-Control': 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
  }
  if (etagMatches(options.ifNoneMatch ?? null, etag))
    return new Response(null, { status: 304, headers })

  headers['Content-Type'] = options.mimeType
  headers['Content-Disposition'] = contentDisposition(
    options.disposition,
    options.name,
  )
  const range = requestedRange(options, size, etag)
  if (range === 'unsatisfiable')
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${size}` },
    })
  if (!range) {
    headers['Content-Length'] = String(size)
    return new Response(fileStream(path), { headers })
  }
  headers['Content-Length'] = String(range.end - range.start + 1)
  headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`
  return new Response(fileStream(path, range), { status: 206, headers })
}
