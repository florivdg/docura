import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { correspondent } from '@/db/schema/documents'
import { isUniqueViolation } from '@/lib/db-errors'

export type CorrespondentRecord = { id: string; name: string }

async function findByLowerName(
  lowerName: string,
): Promise<CorrespondentRecord | null> {
  const rows = await db
    .select({ id: correspondent.id, name: correspondent.name })
    .from(correspondent)
    .where(sql`lower(${correspondent.name}) = ${lowerName}`)
    .limit(1)

  return rows[0] ?? null
}

/**
 * Case-insensitive find-or-create. Loses the unique-index race gracefully by
 * re-reading the winner's row; other DB errors propagate to the caller.
 */
export async function findOrCreateCorrespondent(
  name: string,
): Promise<{ correspondent: CorrespondentRecord; created: boolean } | null> {
  const trimmed = name.trim()
  const lowerName = trimmed.toLowerCase()

  const existing = await findByLowerName(lowerName)
  if (existing) return { correspondent: existing, created: false }

  try {
    const [created] = await db
      .insert(correspondent)
      .values({ name: trimmed })
      .returning({ id: correspondent.id, name: correspondent.name })

    return { correspondent: created, created: true }
  } catch (err) {
    if (isUniqueViolation(err)) {
      const winner = await findByLowerName(lowerName)
      if (winner) return { correspondent: winner, created: false }
      return null
    }
    throw err
  }
}
