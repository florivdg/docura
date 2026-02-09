import type { APIRoute } from 'astro'
import { db } from '@/db'
import { folder } from '@/db/schema/documents'
import { eq } from 'drizzle-orm'

async function buildBreadcrumbs(
  folderId: string,
): Promise<{ id: string; name: string }[]> {
  const breadcrumbs: { id: string; name: string }[] = []
  let currentId: string | null = folderId

  while (currentId) {
    const [current] = await db
      .select({ id: folder.id, name: folder.name, parentId: folder.parentId })
      .from(folder)
      .where(eq(folder.id, currentId))
      .limit(1)

    if (!current) break
    breadcrumbs.unshift({ id: current.id, name: current.name })
    currentId = current.parentId
  }

  return breadcrumbs
}

export const GET: APIRoute = async ({ params }) => {
  const { id } = params

  const [found] = await db
    .select()
    .from(folder)
    .where(eq(folder.id, id!))
    .limit(1)

  if (!found) {
    return new Response(JSON.stringify({ error: 'Ordner nicht gefunden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const breadcrumbs = await buildBreadcrumbs(found.id)

  return new Response(JSON.stringify({ folder: found, breadcrumbs }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const { id } = params
  const body = await request.json()

  const [existing] = await db
    .select()
    .from(folder)
    .where(eq(folder.id, id!))
    .limit(1)

  if (!existing) {
    return new Response(JSON.stringify({ error: 'Ordner nicht gefunden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const updates: Partial<{ name: string; parentId: string | null }> = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Name darf nicht leer sein' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }
    updates.name = body.name.trim()
  }

  if (body.parentId !== undefined) {
    if (body.parentId === id) {
      return new Response(
        JSON.stringify({
          error: 'Ein Ordner kann nicht in sich selbst verschoben werden',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (body.parentId !== null) {
      // Check for circular parentage
      let checkId: string | null = body.parentId
      while (checkId) {
        if (checkId === id) {
          return new Response(
            JSON.stringify({
              error:
                'Ein Ordner kann nicht in einen seiner Unterordner verschoben werden',
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }
        const [parent] = await db
          .select({ parentId: folder.parentId })
          .from(folder)
          .where(eq(folder.id, checkId))
          .limit(1)
        checkId = parent?.parentId ?? null
      }
    }

    updates.parentId = body.parentId
  }

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ folder: existing }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const [updated] = await db
    .update(folder)
    .set(updates)
    .where(eq(folder.id, id!))
    .returning()

  return new Response(JSON.stringify({ folder: updated }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params

  const [existing] = await db
    .select({ id: folder.id })
    .from(folder)
    .where(eq(folder.id, id!))
    .limit(1)

  if (!existing) {
    return new Response(JSON.stringify({ error: 'Ordner nicht gefunden' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  await db.delete(folder).where(eq(folder.id, id!))

  return new Response(null, { status: 204 })
}
