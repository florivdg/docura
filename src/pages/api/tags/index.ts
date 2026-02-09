import type { APIRoute } from 'astro'
import { db } from '@/db'
import { tag, documentTag } from '@/db/schema/documents'
import { eq, sql, asc } from 'drizzle-orm'

export const GET: APIRoute = async () => {
  const docCount = db
    .select({
      tagId: documentTag.tagId,
      count: sql<number>`count(*)::int`.as('count'),
    })
    .from(documentTag)
    .groupBy(documentTag.tagId)
    .as('doc_count')

  const rows = await db
    .select({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      createdAt: tag.createdAt,
      documentCount: sql<number>`coalesce(${docCount.count}, 0)`,
    })
    .from(tag)
    .leftJoin(docCount, eq(tag.id, docCount.tagId))
    .orderBy(asc(tag.name))

  return new Response(JSON.stringify({ tags: rows }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json()
  const { name, color } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'Name darf nicht leer sein' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const [existingTag] = await db
    .select({ id: tag.id })
    .from(tag)
    .where(eq(tag.name, name.trim()))
    .limit(1)

  if (existingTag) {
    return new Response(
      JSON.stringify({ error: 'Ein Tag mit diesem Namen existiert bereits' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const [created] = await db
    .insert(tag)
    .values({ name: name.trim(), color: color || null })
    .returning()

  return new Response(JSON.stringify({ tag: created }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })
}
