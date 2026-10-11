import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/bun-sql/migrator'

import { db } from '@/db'

/** Relative to the working directory: the project root, /app in the image. */
const MIGRATIONS_FOLDER = './drizzle'

/**
 * Created before any migration: 0000_init already uses `vector(…)`, while
 * the extensions are only created by a later migration.
 */
const REQUIRED_EXTENSIONS = ['vector', 'pg_trgm'] as const

/** Rows in Drizzle's journal table; 0 before the first migration. */
async function appliedMigrationCount(): Promise<number> {
  const [journal] = await db.execute<{ exists: boolean }>(
    sql`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS "exists"`,
  )
  if (!journal?.exists) return 0
  const [row] = await db.execute<{ count: number | string }>(
    sql`SELECT count(*) AS "count" FROM drizzle.__drizzle_migrations`,
  )
  return Number(row?.count ?? 0)
}

/**
 * Creates the required extensions and applies pending migrations with the
 * runtime migrator (same journal table as drizzle-kit). Returns the number
 * of newly applied migrations.
 */
export async function runMigrations(
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<number> {
  for (const extension of REQUIRED_EXTENSIONS)
    await db.execute(sql.raw(`CREATE EXTENSION IF NOT EXISTS ${extension}`))
  const before = await appliedMigrationCount()
  await migrate(db, { migrationsFolder })
  return (await appliedMigrationCount()) - before
}

export function migrationSummary(applied: number): string {
  if (applied === 0)
    return 'Datenbank ist aktuell, keine Migrationen ausstehend.'
  return applied === 1
    ? '1 Migration angewendet.'
    : `${applied} Migrationen angewendet.`
}
