import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const created: string[] = []

/** A fresh temp directory; `removeTempDirs` (run after each test file) deletes it. */
export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `docura-${prefix}-`))
  created.push(dir)
  return dir
}

export function removeTempDirs(): void {
  for (const dir of created.splice(0))
    rmSync(dir, { recursive: true, force: true })
}
