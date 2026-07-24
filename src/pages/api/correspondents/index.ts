import type { APIRoute } from 'astro'
import { db } from '@/db'
import { correspondent } from '@/db/schema/documents'
import { asc } from 'drizzle-orm'
import { parseJsonBody, JsonParseError } from '@/lib/api-utils'
import { findOrCreateCorrespondent } from '@/lib/correspondents'

const MAX_NAME_LENGTH = 120

export const GET: APIRoute = async () => {
  const rows = await db
    .select({ id: correspondent.id, name: correspondent.name })
    .from(correspondent)
    .orderBy(asc(correspondent.name))

  return new Response(JSON.stringify({ correspondents: rows }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request }) => {
  let body: { name?: string }
  try {
    body = await parseJsonBody<typeof body>(request)
  } catch (err) {
    if (err instanceof JsonParseError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw err
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''

  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    return new Response(
      JSON.stringify({
        error: `Name muss ein nicht-leerer Text sein (maximal ${MAX_NAME_LENGTH} Zeichen)`,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const result = await findOrCreateCorrespondent(name)
  if (!result) {
    return new Response(
      JSON.stringify({ error: 'Korrespondent konnte nicht erstellt werden' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  return new Response(JSON.stringify({ correspondent: result.correspondent }), {
    status: result.created ? 201 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
