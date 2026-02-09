import type { APIRoute } from 'astro'
import { db } from '@/db'
import { tag } from '@/db/schema/documents'
import { eq, and, ne } from 'drizzle-orm'

export const PATCH: APIRoute = async ({ params, request }) => {
  const { id } = params
  const body = await request.json()

  const [existing] = await db.select().from(tag).where(eq(tag.id, id!)).limit(1)

  if (!existing) {
    return new Response(JSON.stringify({ error: 'Tag nicht gefunden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const updates: Partial<{ name: string; color: string | null }> = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Name darf nicht leer sein' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const [duplicate] = await db
      .select({ id: tag.id })
      .from(tag)
      .where(and(eq(tag.name, body.name.trim()), ne(tag.id, id!)))
      .limit(1)

    if (duplicate) {
      return new Response(
        JSON.stringify({
          error: 'Ein Tag mit diesem Namen existiert bereits',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      )
    }

    updates.name = body.name.trim()
  }

  if (body.color !== undefined) {
    updates.color = body.color || null
  }

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ tag: existing }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const [updated] = await db
    .update(tag)
    .set(updates)
    .where(eq(tag.id, id!))
    .returning()

  return new Response(JSON.stringify({ tag: updated }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params

  const [existing] = await db
    .select({ id: tag.id })
    .from(tag)
    .where(eq(tag.id, id!))
    .limit(1)

  if (!existing) {
    return new Response(JSON.stringify({ error: 'Tag nicht gefunden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  await db.delete(tag).where(eq(tag.id, id!))

  return new Response(null, { status: 204 })
}
