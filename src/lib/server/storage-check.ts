import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { isEnoent, safePath } from '@/lib/api-utils'
import { mapConcurrent } from '@/lib/concurrency'
import { formatFileSize } from '@/lib/format'

/** Parallel `stat` calls while listing UPLOAD_DIR. */
const STAT_CONCURRENCY = 16
/** Parallel hashes for `--verify-hashes`; hashing is disk-bound. */
const HASH_CONCURRENCY = 3

/** A document row as far as the check needs it. */
export interface StorageRow {
  id: string
  name: string
  storagePath: string
  fileSize: number
  sha256: string | null
  trashedAt: Date | null
}

/** A regular file in UPLOAD_DIR. */
export interface StorageEntry {
  name: string
  bytes: number
  mtimeMs: number
}

export interface MissingFile {
  id: string
  name: string
  storagePath: string
  trashedAt: string | null
}

export interface OrphanFile {
  name: string
  bytes: number
  ageMinutes: number
}

export interface Mismatch {
  id: string
  name: string
  storagePath: string
  expected: string | number
  actual: string | number
}

export interface StorageReport {
  missingFiles: MissingFile[]
  orphanFiles: OrphanFile[]
  sizeMismatches: Mismatch[]
  hashMismatches: Mismatch[]
  /** Orphans younger than the minimum age: possibly uploads in flight. */
  pendingFiles: number
  /** Only with `--delete-orphans`. */
  deletedFiles?: string[]
}

/** Watcher snapshots (`*.tmp`) and dotfiles are not documents. */
function isIgnoredName(name: string): boolean {
  return name.startsWith('.') || name.endsWith('.tmp')
}

function missingFile(row: StorageRow): MissingFile {
  return {
    id: row.id,
    name: row.name,
    storagePath: row.storagePath,
    trashedAt: row.trashedAt?.toISOString() ?? null,
  }
}

function sizeMismatch(row: StorageRow, actual: number): Mismatch {
  const { id, name, storagePath, fileSize } = row
  return { id, name, storagePath, expected: fileSize, actual }
}

function compareRows(
  rows: StorageRow[],
  files: Map<string, StorageEntry>,
  report: StorageReport,
) {
  for (const row of rows) {
    const entry = files.get(row.storagePath)
    if (!entry) report.missingFiles.push(missingFile(row))
    else if (entry.bytes !== row.fileSize)
      report.sizeMismatches.push(sizeMismatch(row, entry.bytes))
  }
}

function collectOrphans(
  files: Map<string, StorageEntry>,
  rows: StorageRow[],
  now: number,
  minAgeMs: number,
  report: StorageReport,
) {
  const referenced = new Set(rows.map((row) => row.storagePath))
  for (const entry of files.values()) {
    if (referenced.has(entry.name)) continue
    const ageMs = now - entry.mtimeMs
    if (ageMs < minAgeMs) report.pendingFiles++
    else
      report.orphanFiles.push({
        name: entry.name,
        bytes: entry.bytes,
        ageMinutes: Math.floor(ageMs / 60_000),
      })
  }
}

/**
 * Compares document rows with the files in UPLOAD_DIR: rows without file,
 * files without row (orphans; younger ones only count as pending) and
 * size mismatches. Pure; `entries` are the listed documents files, hashes
 * are checked separately.
 */
export function diffStorage(
  rows: StorageRow[],
  entries: StorageEntry[],
  now: number,
  minAgeMs: number,
): StorageReport {
  const files = new Map(entries.map((entry) => [entry.name, entry]))
  const report: StorageReport = {
    missingFiles: [],
    orphanFiles: [],
    sizeMismatches: [],
    hashMismatches: [],
    pendingFiles: 0,
  }
  compareRows(rows, files, report)
  collectOrphans(files, rows, now, minAgeMs, report)
  return report
}

/**
 * The result of a file operation, or `null` when the file vanished in the
 * meantime (a concurrent deletion); other errors propagate.
 */
async function unlessVanished<T>(operation: Promise<T>): Promise<T | null> {
  try {
    return await operation
  } catch (err) {
    if (isEnoent(err)) return null
    throw err
  }
}

/**
 * The regular files in UPLOAD_DIR; subdirectories, snapshots and dotfiles
 * are skipped before they are stat-ed.
 */
async function listUploadDir(dir: string): Promise<StorageEntry[]> {
  const dirents = await readdir(dir, { withFileTypes: true })
  const names = dirents
    .filter((dirent) => dirent.isFile() && !isIgnoredName(dirent.name))
    .map((dirent) => dirent.name)
  const entries = await mapConcurrent(names, STAT_CONCURRENCY, async (name) => {
    const stats = await unlessVanished(stat(join(dir, name)))
    return stats && { name, bytes: stats.size, mtimeMs: stats.mtimeMs }
  })
  return entries.filter((entry) => entry !== null)
}

/**
 * Hashes every present file whose row has a hash; reads the whole library.
 * Files already reported missing or with a wrong size are skipped; a file
 * that vanishes while hashing is reported as missing.
 */
async function verifyHashes(
  rows: StorageRow[],
  report: StorageReport,
  uploadDir: string,
  hashFile: (path: string) => Promise<string>,
): Promise<void> {
  const reported = new Set(
    [...report.missingFiles, ...report.sizeMismatches].map((item) => item.id),
  )
  const candidates = rows.filter((row) => row.sha256 && !reported.has(row.id))
  const hashes = await mapConcurrent(candidates, HASH_CONCURRENCY, (row) =>
    unlessVanished(hashFile(safePath(uploadDir, row.storagePath))),
  )
  candidates.forEach((row, index) => {
    const { id, name, storagePath, sha256 } = row
    const actual = hashes[index]
    if (actual === null) report.missingFiles.push(missingFile(row))
    else if (actual !== sha256)
      report.hashMismatches.push({
        id,
        name,
        storagePath,
        expected: sha256!,
        actual,
      })
  })
}

/**
 * Deletes the reported orphans (never rows); resolves to their paths. An
 * orphan that is already gone counts as deleted.
 */
export async function deleteOrphans(
  orphans: OrphanFile[],
  uploadDir: string,
  remove: (path: string) => Promise<void> = unlink,
): Promise<string[]> {
  const deleted: string[] = []
  for (const orphan of orphans) {
    const path = safePath(uploadDir, orphan.name)
    await unlessVanished(remove(path))
    deleted.push(path)
  }
  return deleted
}

/** Findings left after an optional orphan deletion (which deletes all orphans). */
function findingCount(report: StorageReport): number {
  return (
    report.missingFiles.length +
    (report.deletedFiles ? 0 : report.orphanFiles.length) +
    report.sizeMismatches.length +
    report.hashMismatches.length
  )
}

function section<T>(
  title: string,
  items: T[],
  describe: (item: T) => string,
): string[] {
  if (items.length === 0) return []
  return [
    `${title} (${items.length}):`,
    ...items.map((i) => `  ${describe(i)}`),
  ]
}

const mismatchLine = (item: Mismatch) =>
  `${item.name} (${item.id}) ${item.storagePath}: erwartet ${item.expected}, gefunden ${item.actual}`

/** German, human-readable summary of a report. */
export function formatStorageReport(report: StorageReport): string {
  const findings = findingCount(report)
  return [
    ...section(
      'Dokumente ohne Datei',
      report.missingFiles,
      (item) =>
        `${item.name} (${item.id}) ${item.storagePath}${item.trashedAt ? ' [Papierkorb]' : ''}`,
    ),
    ...section(
      'Dateien ohne Dokument',
      report.orphanFiles,
      (item) =>
        `${item.name} (${formatFileSize(item.bytes)}, ${item.ageMinutes} min alt)`,
    ),
    ...section('Abweichende Dateigröße', report.sizeMismatches, mismatchLine),
    ...section('Abweichender SHA-256', report.hashMismatches, mismatchLine),
    ...section(
      'Gelöschte verwaiste Dateien',
      report.deletedFiles ?? [],
      (p) => p,
    ),
    `Noch nicht geprüfte junge Dateien: ${report.pendingFiles}`,
    findings === 0
      ? 'Speicher ist konsistent.'
      : `${findings} Befund(e) gefunden.`,
  ].join('\n')
}

export interface StorageCheckOptions {
  json: boolean
  verifyHashes: boolean
  deleteOrphans: boolean
}

const FLAGS: Record<string, keyof StorageCheckOptions> = {
  '--json': 'json',
  '--verify-hashes': 'verifyHashes',
  '--delete-orphans': 'deleteOrphans',
}

/** CLI flags of `storage:check`; an unknown flag throws. */
export function parseStorageCheckArgs(argv: string[]): StorageCheckOptions {
  const options = { json: false, verifyHashes: false, deleteOrphans: false }
  for (const arg of argv) {
    const key = FLAGS[arg]
    if (!key) throw new Error(`Unbekannte Option: ${arg}`)
    options[key] = true
  }
  return options
}

export interface StorageCheckDeps {
  uploadDir: string
  minAgeMs: number
  now: number
  loadRows: () => Promise<StorageRow[]>
  hashFile: (path: string) => Promise<string>
  remove?: (path: string) => Promise<void>
}

/**
 * Runs the check and renders its output. Exit code 0: consistent,
 * 1: findings remain.
 */
export async function runStorageCheck(
  options: StorageCheckOptions,
  deps: StorageCheckDeps,
): Promise<{ report: StorageReport; output: string; exitCode: number }> {
  const rows = await deps.loadRows()
  const entries = await listUploadDir(deps.uploadDir)
  const report = diffStorage(rows, entries, deps.now, deps.minAgeMs)
  if (options.verifyHashes)
    await verifyHashes(rows, report, deps.uploadDir, deps.hashFile)
  if (options.deleteOrphans)
    report.deletedFiles = await deleteOrphans(
      report.orphanFiles,
      deps.uploadDir,
      deps.remove,
    )
  const output = options.json
    ? JSON.stringify(report, null, 2)
    : formatStorageReport(report)
  return { report, output, exitCode: findingCount(report) === 0 ? 0 : 1 }
}
