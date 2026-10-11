import { generateEmbedding } from '@/worker/clients/ollama'
import {
  assertLease,
  type JobLease,
  updateStep,
} from '@/worker/pipeline/job-lifecycle'
import { chunkText } from '@/worker/utils/text'
import {
  averageAndNormalizeVectors,
  storeEmbedding,
  validateVector,
} from '@/worker/utils/vector'

export async function generateAndStoreEmbedding(
  documentId: string,
  textContent: string,
  lease: JobLease,
) {
  await updateStep(lease, 'embedding')

  const chunks = chunkText(textContent)
  const vectors: number[][] = []

  for (const chunk of chunks) {
    const embeddings = await generateEmbedding(chunk, lease.signal)
    vectors.push(validateVector(embeddings[0]))
  }

  const finalVector = averageAndNormalizeVectors(vectors)
  await assertLease(lease)
  await storeEmbedding(documentId, finalVector)
}
