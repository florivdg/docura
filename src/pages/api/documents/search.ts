import type { APIRoute } from 'astro'
import type { SQL } from 'drizzle-orm'
import { eq, isNotNull, or, sql } from 'drizzle-orm'

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

function buildPrefixTsquery(input: string): string | null {
  const tokens = input
    .replace(/[!&|<>():*\\'"]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0)
  if (tokens.length === 0) return null
  return tokens.map((t) => `${t}:*`).join(' & ')
}

function escapeLikePattern(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

async function handleFulltextSearch(query: string, limit: number) {
  if (query.length < 2) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const escaped = escapeLikePattern(query)
  const likePattern = `%${escaped}%`

  const prefixTsq = buildPrefixTsquery(query)
  const tsVector = sql`to_tsvector('german', coalesce(${document.textContent}, ''))`

  const useContentIlike = query.length >= 3

  // Build WHERE conditions
  const nameIlike = sql`${document.name} ILIKE ${likePattern}`
  const fuzzyName = sql`similarity(${document.name}, ${query}) > 0.3`

  const conditions = [nameIlike, fuzzyName]

  if (prefixTsq) {
    const tsQuery = sql`to_tsquery('german', ${prefixTsq})`
    conditions.push(sql`${tsVector} @@ ${tsQuery}`)
  }
  if (useContentIlike) {
    conditions.push(sql`${document.textContent} ILIKE ${likePattern}`)
  }

  // Build relevance score
  const scoreFragments = [
    sql`CASE WHEN ${document.name} ILIKE ${likePattern} THEN 10 ELSE 0 END`,
    sql`5.0 * coalesce(similarity(${document.name}, ${query}), 0)`,
  ]
  if (prefixTsq) {
    const tsQuery = sql`to_tsquery('german', ${prefixTsq})`
    scoreFragments.push(
      sql`3.0 * coalesce(ts_rank(${tsVector}, ${tsQuery}), 0)`,
    )
  }
  if (useContentIlike) {
    scoreFragments.push(
      sql`CASE WHEN ${document.textContent} ILIKE ${likePattern} THEN 1 ELSE 0 END`,
    )
  }

  const relevanceScore = sql`(${sql.join(scoreFragments, sql` + `)})`.as(
    'relevance',
  )

  // Build headline
  let headlineSql: SQL.Aliased<string>
  if (prefixTsq) {
    const tsQuery = sql`to_tsquery('german', ${prefixTsq})`
    if (useContentIlike) {
      headlineSql = sql<string>`
        CASE
          WHEN ${tsVector} @@ ${tsQuery}
          THEN ts_headline('german', coalesce(${document.textContent}, ''), ${tsQuery}, 'MaxWords=30, MinWords=10, MaxFragments=1')
          WHEN ${document.textContent} ILIKE ${likePattern}
          THEN substring(${document.textContent} FROM greatest(1, position(lower(${query}) in lower(${document.textContent})) - 40) FOR (${query.length} + 80))
          ELSE NULL
        END
      `.as('headline')
    } else {
      headlineSql = sql<string>`
        CASE
          WHEN ${tsVector} @@ ${tsQuery}
          THEN ts_headline('german', coalesce(${document.textContent}, ''), ${tsQuery}, 'MaxWords=30, MinWords=10, MaxFragments=1')
          ELSE NULL
        END
      `.as('headline')
    }
  } else if (useContentIlike) {
    headlineSql = sql<string>`
      CASE
        WHEN ${document.textContent} ILIKE ${likePattern}
        THEN substring(${document.textContent} FROM greatest(1, position(lower(${escaped}) in lower(${document.textContent})) - 40) FOR (${escaped.length} + 80))
        ELSE NULL
      END
    `.as('headline')
  } else {
    headlineSql = sql<string>`NULL`.as('headline')
  }

  const rows = await db
    .select({
      id: document.id,
      name: document.name,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      createdAt: document.createdAt,
      folderName: folder.name,
      headline: headlineSql,
      relevance: relevanceScore,
    })
    .from(document)
    .leftJoin(folder, eq(document.folderId, folder.id))
    .where(or(...conditions))
    .orderBy(sql`relevance DESC`)
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
