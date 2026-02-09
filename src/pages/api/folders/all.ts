import type { APIRoute } from 'astro'
import { db } from '@/db'
import { folder } from '@/db/schema/documents'
import { asc } from 'drizzle-orm'

export const GET: APIRoute = async () => {
  const rows = await db
    .select({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
    })
    .from(folder)
    .orderBy(asc(folder.name))

  return new Response(JSON.stringify({ folders: rows }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
