import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
const state = vi.hoisted(() => ({
  config: {
    watchDir: '',
    uploadDir: '',
    watchEnabled: true,
    watchStabilityMs: 1,
    watchDebounceMs: 1,
    watchRescanIntervalMs: 60_000,
    maxFileSizeMB: 1,
  },
  event: null as null | ((event: string, filename: string | null) => void),
  persist: vi.fn(),
  duplicate: vi.fn(),
}))
vi.mock('@/worker/config', () => ({ WORKER_CONFIG: state.config }))
vi.mock('@/db/queries', () => ({ findDocumentBySha256: state.duplicate }))
vi.mock('@/db', () => ({
  db: {
    transaction: async (callback: (tx: unknown) => Promise<void>) =>
      callback({
        insert: () => ({
          values: (value: unknown) => {
            state.persist(value)
            return { returning: async () => [{ id: 'doc' }] }
          },
        }),
      }),
  },
}))
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  watch: (_path: string, callback: typeof state.event) => {
    state.event = callback
    return Object.assign(new EventEmitter(), { close: vi.fn() })
  },
}))
import { startWatcher, stopWatcher } from './watch'
let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'docura-watch-'))
  state.config.watchDir = join(root, 'watch')
  state.config.uploadDir = join(root, 'uploads')
  state.config.watchEnabled = true
  state.persist.mockReset()
  state.duplicate.mockResolvedValue(undefined)
  vi.stubGlobal('Bun', { sleep: async () => {} })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => {
  await stopWatcher()
  await rm(root, { recursive: true, force: true })
  vi.unstubAllGlobals()
})
test('imports existing documents, handles filesystem events and shuts down cleanly', async () => {
  // Start once to create the directories, then scan an existing file on restart.
  await startWatcher()
  await stopWatcher()
  await writeFile(join(state.config.watchDir, 'test.pdf'), '%PDFdata')
  await startWatcher()
  expect(state.persist).toHaveBeenCalledTimes(2)
  expect(await readdir(state.config.watchDir)).toEqual([])
  state.event?.('change', null)
  state.event?.('rename', 'unsupported.txt')
  state.event?.('rename', 'missing.pdf')
  await new Promise((resolve) => setTimeout(resolve, 20))
  await stopWatcher()
})
test('does not start when disabled', async () => {
  state.config.watchEnabled = false
  await startWatcher()
  expect(state.persist).not.toHaveBeenCalled()
})
