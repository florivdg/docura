import type { APIRoute } from 'astro'
import { desc, eq, isNotNull, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import { document, folder } from '@/db/schema/documents'

const OLLAMA_URL = import.meta.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_EMBED_MODEL =
  import.meta.env.OLLAMA_EMBED_MODEL || 'mxbai-embed-large'
const EMBEDDING_DIMENSIONS = 1024
const OLLAMA_TIMEOUT_MS = 30_000

export const GET: APIRoute = async ({ url }) => {
  const query = url.searchParams.get('q')?.trim()
  const mode = url.searchParams.get('mode') || 'fulltext'
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '10', 10), 1),
    50,
  )

  if (!query) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (mode === 'semantic') {
    return handleSemanticSearch(query, limit)
  }

  return handleFulltextSearch(query, limit)
}

async function handleFulltextSearch(query: string, limit: number) {
  const likePattern = `%${query}%`

  const tsQuery = sql`plainto_tsquery('german', ${query})`
  const tsVector = sql`to_tsvector('german', coalesce(${document.textContent}, ''))`

  const rows = await db
    .select({
      id: document.id,
      name: document.name,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      createdAt: document.createdAt,
      folderName: folder.name,
      headline: sql<string>`
        CASE
          WHEN ${tsVector} @@ ${tsQuery}
          THEN ts_headline('german', coalesce(${document.textContent}, ''), ${tsQuery}, 'MaxWords=30, MinWords=10, MaxFragments=1')
          ELSE NULL
        END
      `.as('headline'),
    })
    .from(document)
    .leftJoin(folder, eq(document.folderId, folder.id))
    .where(
      or(
        sql`${document.name} ILIKE ${likePattern}`,
        sql`${tsVector} @@ ${tsQuery}`,
      ),
    )
    .orderBy(desc(document.createdAt))
    .limit(limit)

  return new Response(JSON.stringify({ results: rows }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

async function handleSemanticSearch(query: string, limit: number) {
  let queryVector: number[]
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS)
    try {
      const response = await fetch(`${OLLAMA_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_EMBED_MODEL,
          input: query,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Ollama Fehler: ${response.status}`)
      }
      const result = (await response.json()) as { embeddings: number[][] }
      queryVector = result.embeddings[0]
    } finally {
      clearTimeout(timeoutId)
    }
  } catch {
    return new Response(
      JSON.stringify({
        error: 'Semantische Suche nicht verfügbar (Ollama nicht erreichbar)',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const vectorLiteral = `[${queryVector.join(',')}]`

  const rows = await db
    .select({
      id: document.id,
      name: document.name,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      createdAt: document.createdAt,
      folderName: folder.name,
      similarity:
        sql<number>`1 - (${document.embedding} <=> ${vectorLiteral}::vector)`.as(
          'similarity',
        ),
    })
    .from(document)
    .leftJoin(folder, eq(document.folderId, folder.id))
    .where(isNotNull(document.embedding))
    .orderBy(sql`${document.embedding} <=> ${vectorLiteral}::vector`)
    .limit(limit)

  return new Response(JSON.stringify({ results: rows }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
