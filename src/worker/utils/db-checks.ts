import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { WORKER_CONFIG } from '@/worker/config'

const EXPECTED_EMBEDDING_COLUMN_TYPE = `vector(${WORKER_CONFIG.embeddingDimensions})`

export async function assertDatabaseCompatibility() {
  const extensionRows = await db.execute<{ extensionName: string }>(sql`
    SELECT extname AS "extensionName"
    FROM pg_extension
    WHERE extname = 'vector'
    LIMIT 1
  `)

  if (extensionRows.length === 0) {
    throw new Error(
      'PostgreSQL-Extension "vector" fehlt. Bitte installiere/aktiviere pgvector.',
    )
  }

  const columnRows = await db.execute<{ columnType: string }>(sql`
    SELECT format_type(a.atttypid, a.atttypmod) AS "columnType"
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'document'
      AND a.attname = 'embedding'
      AND a.attnum > 0
      AND NOT a.attisdropped
    LIMIT 1
  `)

  if (columnRows.length === 0) {
    throw new Error(
      'Spalte "public.document.embedding" fehlt. Bitte Schema mit "bun run db:push" synchronisieren.',
    )
  }

  const actualType = columnRows[0].columnType
  if (actualType !== EXPECTED_EMBEDDING_COLUMN_TYPE) {
    throw new Error(
      `Ungültiger Spaltentyp für "public.document.embedding": ${actualType}. Erwartet: ${EXPECTED_EMBEDDING_COLUMN_TYPE}. Bitte "bun run db:push" ausführen.`,
    )
  }
}
