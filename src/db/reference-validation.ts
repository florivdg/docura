import { eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { correspondent, folder, tag } from '@/db/schema/documents'

/** Whether the folder or correspondent a request references exists. */
export async function referenceExists(
  kind: 'folder' | 'correspondent',
  id: string,
): Promise<boolean> {
  const table = kind === 'folder' ? folder : correspondent
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.id, id))
    .limit(1)
  return rows.length > 0
}

/** How many of the tag ids exist. */
export async function countExistingTags(ids: string[]): Promise<number> {
  const rows = await db
    .select({ id: tag.id })
    .from(tag)
    .where(inArray(tag.id, ids))
  return rows.length
}
