#!/usr/bin/env bun
import { databaseUrlProblem } from '@/lib/server/database-url'

// Usage: bun run db:migrate (compose: the one-shot `migrate` service)
// Exit codes: 0 ok, 1 failed.

// Before '@/db' is loaded: it connects on import and would fail with a bare
// "Invalid URL" (static imports run first, hence the dynamic ones below).
const problem = databaseUrlProblem(process.env.DATABASE_URL)
if (problem) {
  console.error(`Migration fehlgeschlagen: ${problem}`)
  process.exit(1)
}

const { runDbCli } = await import('@/lib/server/db-cli')
const { migrationSummary, runMigrations } =
  await import('@/lib/server/migrations')

await runDbCli(
  async () => {
    console.log(migrationSummary(await runMigrations()))
    return 0
  },
  'Migration fehlgeschlagen:',
  1,
)
