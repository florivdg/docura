import { configure, ZipWriter } from '@zip.js/zip.js'
import {
  METADATA_CSV,
  METADATA_JSON,
  metadataCsvChunks,
  metadataJsonChunks,
  type ExportDocumentRow,
  type ExportRecord,
  type TextLoader,
} from '@/lib/export-metadata'
import {
  buildFolderPaths,
  ExportPathAllocator,
  sanitizeExportName,
  type FolderNode,
  type FolderPaths,
} from '@/lib/export-paths'
import { contentDisposition } from '@/lib/http-headers'
import { openStoredFile } from './file-response'

// Workers would load a separate script; the export runs inline on the server.
configure({ useWebWorkers: false })

/** Rows are loaded in batches of this size, so memory stays bounded. */
const ROW_BATCH_SIZE = 500

/** What to export; the database adapter lives in `@/db/document-export`. */
export interface ExportSource {
  /** Document ids in export order. */
  ids: string[]
  folders: FolderNode[]
  loadRows: (ids: string[]) => Promise<ExportDocumentRow[]>
  loadTexts: TextLoader
}

export interface ExportOptions {
  uploadDir: string
  signal?: AbortSignal
  now?: Date
}

interface ExportContext {
  writer: ZipWriter<unknown>
  folders: FolderPaths
  allocator: ExportPathAllocator
  options: ExportOptions
}

const iso = (value: Date | null) => value?.toISOString() ?? null

function exportRecord(
  row: ExportDocumentRow,
  path: string,
  folder: string | null,
  fileMissing: boolean,
): ExportRecord {
  const { storagePath: _storagePath, folderId: _folderId, ...fields } = row
  return {
    ...fields,
    path,
    folder,
    archivedAt: iso(row.archivedAt),
    trashedAt: iso(row.trashedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    fileMissing,
  }
}

async function addDocument(
  context: ExportContext,
  row: ExportDocumentRow,
): Promise<ExportRecord> {
  const directory = row.folderId
    ? (context.folders.directory.get(row.folderId) ?? '')
    : ''
  const path = context.allocator.allocate(
    directory,
    sanitizeExportName(row.name, row.mimeType),
  )
  const folder = row.folderId
    ? (context.folders.label.get(row.folderId) ?? null)
    : null
  // Opened before the entry is added: a file that is missing or unreadable
  // now is flagged instead of breaking the archive midway.
  const file = await openStoredFile(context.options.uploadDir, row.storagePath)
  if (file)
    try {
      // PDFs and images are compressed already; storing them is much faster.
      await context.writer.add(path, file.stream, {
        level: 0,
        lastModDate: row.createdAt,
        signal: context.options.signal,
      })
    } finally {
      await file.close()
    }
  return exportRecord(row, path, folder, !file)
}

/** A byte stream of UTF-8 encoded text chunks, pulled one at a time. */
function textStream(
  chunks: Iterator<string> | AsyncIterator<string>,
): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await chunks.next()
      if (done) controller.close()
      else controller.enqueue(encoder.encode(value))
    },
  })
}

async function addDocuments(
  context: ExportContext,
  source: ExportSource,
): Promise<ExportRecord[]> {
  const records: ExportRecord[] = []
  for (let start = 0; start < source.ids.length; start += ROW_BATCH_SIZE) {
    context.options.signal?.throwIfAborted()
    const rows = await source.loadRows(
      source.ids.slice(start, start + ROW_BATCH_SIZE),
    )
    for (const row of rows) records.push(await addDocument(context, row))
  }
  return records
}

/**
 * Writes the export ZIP to `writable`: the files in their folder structure
 * (unfiled documents at the root), then `metadata.json` and `metadata.csv`.
 * Missing or unreadable files are skipped and flagged with `fileMissing`.
 * Each `add` waits until the consumer has taken the data, so a slow download
 * throttles reading. For HTTP this relies on the patched Astro Node adapter
 * (`patches/astro@*.patch`), which waits for `drain`; unpatched, the adapter
 * buffers the whole archive in memory for a slow client. Resolves to the
 * number of documents.
 */
export async function writeExportZip(
  writable: WritableStream,
  source: ExportSource,
  options: ExportOptions,
): Promise<number> {
  const reserved = [METADATA_JSON, METADATA_CSV]
  const folders = buildFolderPaths(source.folders, reserved)
  const context: ExportContext = {
    writer: new ZipWriter(writable),
    folders,
    // Files share one namespace with the folder directories.
    allocator: new ExportPathAllocator(reserved, folders.directory.values()),
    options,
  }
  const records = await addDocuments(context, source)
  const { writer } = context
  const { signal, now = new Date() } = options
  const jsonChunks = metadataJsonChunks(records, now, source.loadTexts)
  await writer.add(METADATA_JSON, textStream(jsonChunks), { signal })
  const csvChunks = metadataCsvChunks(records)
  await writer.add(METADATA_CSV, textStream(csvChunks), { signal })
  await writer.close()
  return records.length
}

/**
 * The export ZIP as a response body. Writing starts immediately; a failure
 * errors the stream, so the client sees an aborted download rather than a
 * truncated archive.
 */
export function exportZipStream(
  source: ExportSource,
  options: ExportOptions,
): ReadableStream {
  let fail: (reason: unknown) => void = () => {}
  const { readable, writable } = new TransformStream({
    start(controller) {
      fail = (reason) => controller.error(reason)
    },
  })
  writeExportZip(writable, source, options).catch((error: unknown) => {
    if (!options.signal?.aborted) console.error('Export fehlgeschlagen:', error)
    fail(error)
  })
  return readable
}

const pad = (value: number) => String(value).padStart(2, '0')

/** `docura-export-YYYYMMDD-HHMM.zip` in server-local time. */
export function exportFileName(now: Date): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  return `docura-export-${date}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`
}

/** Download headers; chunked, so there is no `Content-Length`. */
export function exportResponseHeaders(now: Date): Record<string, string> {
  return {
    'Content-Type': 'application/zip',
    'Content-Disposition': contentDisposition(
      'attachment',
      exportFileName(now),
    ),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
}
