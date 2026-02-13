import type { APIRoute } from 'astro'
import { db } from '@/db'
import { folder } from '@/db/schema/documents'
import { eq, isNull, sql, asc } from 'drizzle-orm'

export const GET: APIRoute = async ({ url }) => {
  const parentId = url.searchParams.get('parentId')

  const childCount = db
    .select({
      parentId: folder.parentId,
      count: sql<number>`count(*)::int`.as('count'),
    })
    .from(folder)
    .groupBy(folder.parentId)
    .as('child_count')

  const rows = await db
    .select({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      createdAt: folder.createdAt,
      childCount: sql<number>`coalesce(${childCount.count}, 0)`,
    })
    .from(folder)
    .leftJoin(childCount, eq(folder.id, childCount.parentId))
    .where(parentId ? eq(folder.parentId, parentId) : isNull(folder.parentId))
    .orderBy(asc(folder.name))

  return new Response(JSON.stringify({ folders: rows }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request }) => {
  let body: any
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiger JSON-Body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const { name, parentId } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'Name darf nicht leer sein' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (parentId) {
    const [parent] = await db
      .select({ id: folder.id })
      .from(folder)
      .where(eq(folder.id, parentId))
      .limit(1)

    if (!parent) {
      return new Response(
        JSON.stringify({ error: 'Übergeordneter Ordner nicht gefunden' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      )
    }
  }

  const [created] = await db
    .insert(folder)
    .values({ name: name.trim(), parentId: parentId || null })
    .returning()

  return new Response(JSON.stringify({ folder: created }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })
}
