#!/usr/bin/env bun
import { db } from '@/db'
import { document } from '@/db/schema/documents'
import { computeFileSha256 } from '@/lib/hash'
import { runDbCli } from '@/lib/server/db-cli'
import {
  parseStorageCheckArgs,
  runStorageCheck,
} from '@/lib/server/storage-check'
import { STORAGE_CONFIG } from '@/lib/server/storage-config'

// Usage: bun run storage:check [--json] [--verify-hashes] [--delete-orphans]
// Exit codes: 0 consistent, 1 findings, 2 error.
async function main(): Promise<number> {
  const { output, exitCode } = await runStorageCheck(
    parseStorageCheckArgs(process.argv.slice(2)),
    {
      uploadDir: STORAGE_CONFIG.uploadDir,
      minAgeMs: STORAGE_CONFIG.orphanMinAgeMs,
      now: Date.now(),
      hashFile: computeFileSha256,
      loadRows: () =>
        db
          .select({
            id: document.id,
            name: document.name,
            storagePath: document.storagePath,
            fileSize: document.fileSize,
            sha256: document.sha256,
            trashedAt: document.trashedAt,
          })
          .from(document),
    },
  )
  console.log(output)
  return exitCode
}

await runDbCli(main, 'Konsistenzprüfung fehlgeschlagen:', 2)
