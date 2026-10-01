import { copyFile, lstat, open, rename, stat, unlink } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { EXT_TO_MIME, validateMagicBytes } from '@/lib/file-validation'
import { computeFileSha256 } from '@/lib/hash'
import { isUniqueViolation } from '@/lib/db-errors'

interface WatchDocument {
  name: string
  mimeType: string
  fileSize: number
  storagePath: string
  sha256: string
  folderId: null
}

interface IngestOptions {
  watchDir: string
  uploadDir: string
  maxFileSizeMB: number
  isPending: () => boolean
  waitForStability: (path: string) => Promise<number>
  findDuplicate: (sha256: string) => Promise<unknown>
  persist: (document: WatchDocument) => Promise<void>
}

async function readableSource(
  filePath: string,
  options: IngestOptions,
): Promise<boolean> {
  if ((await lstat(filePath)).isSymbolicLink()) {
    console.log(`[Watch] Symlinks werden nicht unterstützt: ${filePath}`)
    return false
  }
  return (await options.waitForStability(filePath)) >= 0
}

async function validateSnapshot(
  path: string,
  mimeType: string,
  maxMB: number,
): Promise<number | null> {
  const { size } = await stat(path)
  if (size > maxMB * 1024 * 1024) {
    console.warn(`[Watch] Datei zu groß, übersprungen: ${path}`)
    return null
  }
  const header = Buffer.alloc(12)
  const handle = await open(path, 'r')
  try {
    await handle.read(header, 0, header.length, 0)
  } finally {
    await handle.close()
  }
  if (!validateMagicBytes(header, mimeType)) {
    console.warn(
      `[Watch] Magic-Bytes stimmen nicht mit Erweiterung überein, übersprungen: ${path}`,
    )
    return null
  }
  return size
}

async function persistSnapshot(
  tempPath: string,
  storagePath: string,
  doc: WatchDocument,
  options: IngestOptions,
): Promise<void> {
  await rename(tempPath, storagePath)
  try {
    await options.persist(doc)
    console.log(`[Watch] Datei importiert: ${doc.name} -> ${doc.storagePath}`)
  } catch (error) {
    await unlink(storagePath).catch(() => {})
    if (!isUniqueViolation(error)) throw error
    console.log(
      `[Watch] Duplikat übersprungen (bereits vorhanden): ${doc.name}`,
    )
  }
}

/** Owns the temporary snapshot; the source is removed only after persistence succeeds. */
export async function ingestWatchFile(
  filename: string,
  options: IngestOptions,
): Promise<void> {
  const ext = extname(filename).toLowerCase().slice(1)
  const mimeType = EXT_TO_MIME[ext]
  if (!mimeType) return
  const filePath = join(options.watchDir, filename)
  if (!(await readableSource(filePath, options))) return
  const storageName = `${randomUUID()}.${ext}`
  const storagePath = join(options.uploadDir, storageName)
  const tempPath = `${storagePath}.tmp`
  try {
    await copyFile(filePath, tempPath)
    const fileSize = await validateSnapshot(
      tempPath,
      mimeType,
      options.maxFileSizeMB,
    )
    if (fileSize === null) return
    const sha256 = await computeFileSha256(tempPath)
    if (!(await options.findDuplicate(sha256))) {
      await persistSnapshot(
        tempPath,
        storagePath,
        {
          name: filename,
          mimeType,
          fileSize,
          storagePath: storageName,
          sha256,
          folderId: null,
        },
        options,
      )
    } else {
      console.log(
        `[Watch] Duplikat übersprungen (bereits vorhanden): ${filename}`,
      )
    }
    if (!options.isPending()) await unlink(filePath).catch(() => {})
  } finally {
    await unlink(tempPath).catch(() => {})
  }
}
