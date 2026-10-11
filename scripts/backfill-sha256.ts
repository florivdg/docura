#!/usr/bin/env bun
import { runDbCli } from '@/lib/server/db-cli'
import { backfillSha256 } from '@/lib/server/sha256-backfill'
import { STORAGE_CONFIG } from '@/lib/server/storage-config'

await runDbCli(
  async () => {
    await backfillSha256(STORAGE_CONFIG.uploadDir)
    return 0
  },
  '[Backfill] Abbruch durch schwerwiegenden Fehler:',
  1,
)
