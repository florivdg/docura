/** A document row as the export loads it from the database. */
export interface ExportDocumentRow {
  id: string
  name: string
  mimeType: string
  fileSize: number
  storagePath: string
  sha256: string | null
  folderId: string | null
  correspondent: string | null
  documentDate: string | null
  tags: { name: string; color: string | null }[]
  isFavorite: boolean
  archivedAt: Date | null
  trashedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type Timestamps = 'archivedAt' | 'trashedAt' | 'createdAt' | 'updatedAt'

/** One exported document as described in `metadata.json` and `metadata.csv`. */
export type ExportRecord = Omit<
  ExportDocumentRow,
  'storagePath' | 'folderId' | Timestamps
> & {
  /** Path inside the archive; also set when the file itself was missing. */
  path: string
  /** Folder path such as `Steuer/2025`, `null` for unfiled documents. */
  folder: string | null
  archivedAt: string | null
  trashedAt: string | null
  createdAt: string
  updatedAt: string
  fileMissing: boolean
}

export const METADATA_JSON = 'metadata.json'
export const METADATA_CSV = 'metadata.csv'
const METADATA_VERSION = 1

/** Loads `textContent` for a batch of document ids. */
export type TextLoader = (ids: string[]) => Promise<Map<string, string | null>>

const TEXT_BATCH_SIZE = 500

function jsonDocument(record: ExportRecord, textContent: string | null) {
  const { fileMissing, ...fields } = record
  return JSON.stringify({ ...fields, textContent, fileMissing })
}

/**
 * `metadata.json` as text chunks, one document per chunk. The extracted
 * texts are loaded in batches while the entry is written, so a large export
 * never holds all of them.
 */
export async function* metadataJsonChunks(
  records: ExportRecord[],
  exportedAt: Date,
  loadTexts: TextLoader,
): AsyncGenerator<string> {
  yield `{"version":${METADATA_VERSION},"exportedAt":${JSON.stringify(exportedAt.toISOString())},"count":${records.length},"documents":[`
  for (let start = 0; start < records.length; start += TEXT_BATCH_SIZE) {
    const batch = records.slice(start, start + TEXT_BATCH_SIZE)
    const texts = await loadTexts(batch.map((record) => record.id))
    for (const record of batch)
      yield (record === records[0] ? '' : ',') +
        jsonDocument(record, texts.get(record.id) ?? null)
  }
  yield ']}'
}

const CSV_COLUMNS = [
  'id',
  'path',
  'name',
  'mimeType',
  'fileSize',
  'sha256',
  'folder',
  'correspondent',
  'documentDate',
  'tags',
  'isFavorite',
  'archivedAt',
  'trashedAt',
  'createdAt',
  'updatedAt',
  'fileMissing',
] as const

/** Leading characters that make a spreadsheet treat a cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/

/**
 * RFC 4180 quoting for the `;`-separated format German Excel expects. Text
 * that starts like a formula (`=`, `+`, `-`, `@`, tab, CR) gets a leading `'`
 * (CWE-1236): names, tags and correspondents may come from untrusted file
 * names and LLM output. Numbers and booleans stay unchanged.
 */
export function csvField(value: string | number | boolean | null): string {
  const raw = value === null ? '' : String(value)
  const text =
    typeof value === 'string' && FORMULA_START.test(raw) ? `'${raw}` : raw
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvRow(record: ExportRecord): string {
  return CSV_COLUMNS.map((column) =>
    csvField(
      column === 'tags'
        ? record.tags.map((tag) => tag.name).join('|')
        : record[column],
    ),
  ).join(';')
}

/**
 * `metadata.csv` row by row: a UTF-8 BOM (so Excel detects the encoding),
 * the header and one CRLF-terminated line per document. Text values that
 * start like a formula are prefixed with `'` (see `csvField`);
 * `metadata.json` keeps the original values.
 */
export function* metadataCsvChunks(records: ExportRecord[]): Generator<string> {
  yield `\uFEFF${CSV_COLUMNS.join(';')}\r\n`
  for (const record of records) yield `${csvRow(record)}\r\n`
}
