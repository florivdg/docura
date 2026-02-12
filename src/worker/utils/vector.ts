import { eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { document } from '@/db/schema/documents'
import { WORKER_CONFIG } from '@/worker/config'

export function validateVector(vector: unknown): number[] {
  if (!Array.isArray(vector)) {
    throw new Error('Embedding ist kein Array')
  }
  if (vector.length !== WORKER_CONFIG.embeddingDimensions) {
    throw new Error(
      `Embedding hat ${vector.length} Dimensionen, erwartet ${WORKER_CONFIG.embeddingDimensions} (Modell: ${WORKER_CONFIG.ollamaEmbedModel})`,
    )
  }
  for (let i = 0; i < vector.length; i++) {
    if (typeof vector[i] !== 'number' || !Number.isFinite(vector[i])) {
      throw new Error(
        `Embedding enthält ungültigen Wert an Position ${i}: ${vector[i]}`,
      )
    }
  }
  return vector as number[]
}

export function toPgVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`
}

export function averageAndNormalizeVectors(vectors: number[][]): number[] {
  const dimensions = WORKER_CONFIG.embeddingDimensions

  if (vectors.length === 1) return vectors[0]

  const finalVector = Array.from<number>({ length: dimensions }).fill(0)
  for (const vec of vectors) {
    for (let i = 0; i < dimensions; i++) {
      finalVector[i] += vec[i]
    }
  }
  let norm = 0
  for (let i = 0; i < dimensions; i++) {
    norm += finalVector[i] * finalVector[i]
  }
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      finalVector[i] /= norm
    }
  }
  return finalVector
}

export async function storeEmbedding(documentId: string, vector: number[]) {
  const vectorLiteral = toPgVectorLiteral(vector)

  try {
    await db
      .update(document)
      .set({ embedding: sql`${vectorLiteral}::vector` })
      .where(eq(document.id, documentId))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Embedding konnte nicht gespeichert werden: ${message}. Prüfe "public.document.embedding" auf vector(${WORKER_CONFIG.embeddingDimensions}) und synchronisiere bei Bedarf mit "bun run db:push".`,
    )
  }
}
