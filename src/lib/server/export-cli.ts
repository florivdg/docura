import { once } from 'node:events'
import { createWriteStream, type WriteStream } from 'node:fs'
import { rename, unlink } from 'node:fs/promises'
import { Writable } from 'node:stream'
import { exportFileName, writeExportZip, type ExportSource } from './export-zip'

export interface ExportCliOptions {
  out: string
  includeArchived: boolean
  includeTrash: boolean
}

/**
 * `bun run export [--out <file.zip>] [--include-archived] [--include-trash]`;
 * an unknown flag or a missing `--out` value throws.
 */
export function parseExportArgs(argv: string[], now: Date): ExportCliOptions {
  const options = {
    out: exportFileName(now),
    includeArchived: false,
    includeTrash: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--include-archived') options.includeArchived = true
    else if (arg === '--include-trash') options.includeTrash = true
    else if (arg === '--out' && argv[i + 1]) options.out = argv[++i]
    else throw new Error(`Unbekannte oder unvollständige Option: ${arg}`)
  }
  return options
}

/** Closes the file (also while it is still opening) and deletes it. */
async function discard(file: WriteStream, path: string): Promise<void> {
  if (!file.closed) await once(file.destroy(), 'close')
  await unlink(path).catch(() => {})
}

/**
 * Writes the export to `out` via `<out>.partial`, so an aborted run never
 * leaves a ZIP that looks complete. Resolves to the number of documents.
 */
export async function writeExportFile(
  out: string,
  source: ExportSource,
  uploadDir: string,
): Promise<number> {
  const partial = `${out}.partial`
  const file = createWriteStream(partial)
  try {
    const count = await writeExportZip(Writable.toWeb(file), source, {
      uploadDir,
    })
    await rename(partial, out)
    return count
  } catch (error) {
    await discard(file, partial)
    throw error
  }
}
