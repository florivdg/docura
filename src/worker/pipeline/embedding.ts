import { generateEmbedding } from '@/worker/clients/ollama'
import { updateStep } from '@/worker/pipeline/job-lifecycle'
import { chunkText } from '@/worker/utils/text'
import {
  averageAndNormalizeVectors,
  storeEmbedding,
  validateVector,
} from '@/worker/utils/vector'

export async function generateAndStoreEmbedding(
  documentId: string,
  textContent: string,
  jobId: string,
) {
  await updateStep(jobId, documentId, 'embedding')

  const chunks = chunkText(textContent)
  const vectors: number[][] = []

  for (const chunk of chunks) {
    const embeddings = await generateEmbedding(chunk)
    vectors.push(validateVector(embeddings[0]))
  }

  const finalVector = averageAndNormalizeVectors(vectors)
  await storeEmbedding(documentId, finalVector)
}
