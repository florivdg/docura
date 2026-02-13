import { watch, type FSWatcher } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  stat,
  unlink,
} from 'node:fs/promises'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { db } from '@/db'
import { document, processingJob } from '@/db/schema/documents'
import { EXT_TO_MIME, validateMagicBytes } from '@/lib/file-validation'
import { WORKER_CONFIG } from '@/worker/config'

let watcher: FSWatcher | null = null
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const processingFiles = new Set<string>()
const pendingRerun = new Set<string>()
const activeIngests = new Set<Promise<void>>()
let rescanTimer: ReturnType<typeof setInterval> | null = null

const MAGIC_HEADER_SIZE = 12 // WebP needs offset 8 + 4 bytes

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ENOENT'
}

function isSupportedFile(filename: string): boolean {
  if (filename.startsWith('.')) return false
  const ext = extname(filename).toLowerCase().slice(1)
  return ext in EXT_TO_MIME
}

async function waitForStability(filePath: string): Promise<number> {
  const maxAttempts = 30
  let previousSize = -1

  for (let i = 0; i < maxAttempts; i++) {
    let currentSize: number
    try {
      const s = await stat(filePath)
      currentSize = s.size
    } catch (err: unknown) {
      if (isEnoent(err)) return -1
      throw err
    }

    if (currentSize === previousSize && currentSize > 0) {
      return currentSize
    }
    if (currentSize === 0 && previousSize === 0 && i >= 2) {
      console.log(`[Watch] Datei ist leer (0 Bytes): ${filePath}`)
      return -1
    }
    previousSize = currentSize
    await Bun.sleep(WORKER_CONFIG.watchStabilityMs)
  }

  console.warn(
    `[Watch] Datei nicht stabil nach ${maxAttempts} Versuchen: ${filePath}`,
  )
  return -1
}

async function ingestFile(filename: string): Promise<void> {
  if (processingFiles.has(filename)) {
    pendingRerun.add(filename)
    return
  }
  processingFiles.add(filename)

  const filePath = join(WORKER_CONFIG.watchDir, filename)
  const ext = extname(filename).toLowerCase().slice(1)
  const mimeType = EXT_TO_MIME[ext]

  try {
    if (!mimeType) {
      console.log(
        `[Watch] Nicht unterstützte Erweiterung, übersprungen: ${filename}`,
      )
      return
    }

    let fileStat
    try {
      fileStat = await lstat(filePath)
    } catch (err: unknown) {
      if (isEnoent(err)) {
        console.log(`[Watch] Datei verschwunden: ${filename}`)
        return
      }
      throw err
    }
    if (fileStat.isSymbolicLink()) {
      console.log(`[Watch] Symlinks werden nicht unterstützt: ${filename}`)
      return
    }

    const fileSize = await waitForStability(filePath)
    if (fileSize < 0) {
      console.log(
        `[Watch] Datei nicht verfügbar oder nicht stabil: ${filename}`,
      )
      return
    }

    const storageName = `${randomUUID()}.${ext}`
    const tempPath = join(WORKER_CONFIG.uploadDir, `${storageName}.tmp`)
    const storagePath = join(WORKER_CONFIG.uploadDir, storageName)

    try {
      await copyFile(filePath, tempPath)
    } catch (err: unknown) {
      if (isEnoent(err)) {
        console.log(`[Watch] Datei verschwunden: ${filename}`)
        return
      }
      throw err
    }

    try {
      const tempStat = await stat(tempPath)
      const actualSize = tempStat.size

      const maxBytes = WORKER_CONFIG.maxFileSizeMB * 1024 * 1024
      if (actualSize > maxBytes) {
        console.warn(
          `[Watch] Datei zu groß (${(actualSize / 1024 / 1024).toFixed(1)} MB > ${WORKER_CONFIG.maxFileSizeMB} MB), übersprungen: ${filename}`,
        )
        return
      }

      const headerBuffer = Buffer.alloc(MAGIC_HEADER_SIZE)
      const fileHandle = await open(tempPath, 'r')
      try {
        await fileHandle.read(headerBuffer, 0, MAGIC_HEADER_SIZE, 0)
      } finally {
        await fileHandle.close()
      }

      if (!validateMagicBytes(headerBuffer, mimeType)) {
        console.warn(
          `[Watch] Magic-Bytes stimmen nicht mit Erweiterung überein, übersprungen: ${filename}`,
        )
        return
      }

      await rename(tempPath, storagePath)
      if (!pendingRerun.has(filename)) {
        await unlink(filePath).catch(() => {})
      }

      try {
        await db.transaction(async (tx) => {
          const [doc] = await tx
            .insert(document)
            .values({
              name: filename,
              mimeType,
              fileSize: actualSize,
              storagePath: storageName,
              folderId: null,
            })
            .returning()

          await tx.insert(processingJob).values({ documentId: doc.id })
        })

        console.log(`[Watch] Datei importiert: ${filename} -> ${storageName}`)
      } catch (dbErr) {
        await unlink(storagePath).catch(() => {})
        throw dbErr
      }
    } finally {
      await unlink(tempPath).catch(() => {})
    }
  } catch (err: unknown) {
    if (isEnoent(err)) {
      console.log(
        `[Watch] Datei verschwunden während Verarbeitung: ${filename}`,
      )
    } else {
      console.error(`[Watch] Fehler bei Datei ${filename}:`, err)
    }
  } finally {
    processingFiles.delete(filename)
    if (pendingRerun.delete(filename)) {
      scheduleIngest(filename)
    }
  }
}

function scheduleIngest(filename: string): void {
  const promise = ingestFile(filename).finally(() => {
    activeIngests.delete(promise)
  })
  activeIngests.add(promise)
}

function handleFsEvent(filename: string | null): void {
  if (!filename || !isSupportedFile(filename)) return

  const existing = debounceTimers.get(filename)
  if (existing) clearTimeout(existing)

  debounceTimers.set(
    filename,
    setTimeout(() => {
      debounceTimers.delete(filename)
      scheduleIngest(filename)
    }, WORKER_CONFIG.watchDebounceMs),
  )
}

async function processExistingFiles(): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(WORKER_CONFIG.watchDir)
  } catch {
    return
  }

  const supported = entries.filter(isSupportedFile)
  if (supported.length > 0) {
    console.log(
      `[Watch] ${supported.length} vorhandene Datei(en) im Watch-Verzeichnis gefunden`,
    )
  }

  for (const filename of supported) {
    if (!watcher) return
    await ingestFile(filename)
  }
}

export async function startWatcher(): Promise<void> {
  if (!WORKER_CONFIG.watchEnabled) {
    console.log('[Watch] Deaktiviert (WATCH_ENABLED=false)')
    return
  }

  await mkdir(WORKER_CONFIG.watchDir, { recursive: true })
  await mkdir(WORKER_CONFIG.uploadDir, { recursive: true })

  watcher = watch(WORKER_CONFIG.watchDir, (event, filename) => {
    if (event === 'rename' || event === 'change') {
      handleFsEvent(filename)
    }
  })

  watcher.on('error', (err) => {
    console.error('[Watch] Watcher-Fehler:', err)
  })

  await processExistingFiles()

  rescanTimer = setInterval(() => {
    void processExistingFiles()
  }, WORKER_CONFIG.watchRescanIntervalMs)

  console.log(`[Watch] Überwache Verzeichnis: ${WORKER_CONFIG.watchDir}`)
}

export async function stopWatcher(): Promise<void> {
  if (watcher) {
    watcher.close()
    watcher = null
  }

  for (const timer of debounceTimers.values()) {
    clearTimeout(timer)
  }
  debounceTimers.clear()
  pendingRerun.clear()

  if (rescanTimer) {
    clearInterval(rescanTimer)
    rescanTimer = null
  }

  if (activeIngests.size > 0) {
    console.log(
      `[Watch] Warte auf ${activeIngests.size} laufende Verarbeitung(en)...`,
    )
    await Promise.allSettled(activeIngests)
  }

  console.log('[Watch] Watcher gestoppt')
}
