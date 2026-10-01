import { ingestWatchFile } from '@/worker/ingest-watch-file'
import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { db } from '@/db'
import { findDocumentBySha256 } from '@/db/queries'
import { document, processingJob } from '@/db/schema/documents'
import { isEnoent } from '@/lib/api-utils'
import { EXT_TO_MIME } from '@/lib/file-validation'
import { WORKER_CONFIG } from '@/worker/config'

let watcher: FSWatcher | null = null
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const processingFiles = new Set<string>()
const pendingRerun = new Set<string>()
const activeIngests = new Set<Promise<void>>()
let rescanTimer: ReturnType<typeof setInterval> | null = null

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

  try {
    await ingestWatchFile(filename, {
      ...WORKER_CONFIG,
      isPending: () => pendingRerun.has(filename),
      waitForStability,
      findDuplicate: findDocumentBySha256,
      persist: async (values) => {
        await db.transaction(async (tx) => {
          const [doc] = await tx.insert(document).values(values).returning()
          await tx.insert(processingJob).values({ documentId: doc.id })
        })
      },
    })
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
