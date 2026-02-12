import { WORKER_CONFIG } from '@/worker/config'
import { fetchWithTimeout } from '@/worker/utils/fetch-with-timeout'

export async function generateLlmResponse(prompt: string): Promise<string> {
  const response = await fetchWithTimeout(
    `${WORKER_CONFIG.ollamaUrl}/api/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: WORKER_CONFIG.ollamaLlmModel,
        prompt,
        stream: false,
        format: 'json',
      }),
    },
    WORKER_CONFIG.ollamaTimeoutMs,
  )

  if (!response.ok) {
    throw new Error(
      `LLM-Anfrage fehlgeschlagen: ${response.status} ${response.statusText}`,
    )
  }

  const raw = (await response.json()) as { response: string }
  return raw.response
}

export async function generateEmbedding(input: string): Promise<number[][]> {
  const response = await fetchWithTimeout(
    `${WORKER_CONFIG.ollamaUrl}/api/embed`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: WORKER_CONFIG.ollamaEmbedModel,
        input,
        dimensions: WORKER_CONFIG.embeddingDimensions,
      }),
    },
    WORKER_CONFIG.ollamaTimeoutMs,
  )

  if (!response.ok) {
    throw new Error(`Ollama Fehler: ${response.status} ${response.statusText}`)
  }

  const result = (await response.json()) as { embeddings: number[][] }
  return result.embeddings
}
