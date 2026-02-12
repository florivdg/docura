export const WORKER_CONFIG = {
  pollIntervalMs: 3000,
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL || 'mxbai-embed-large',
  ollamaLlmModel: process.env.OLLAMA_LLM_MODEL || 'llama3',
  ocrServiceUrl: process.env.OCR_SERVICE_URL || 'http://localhost:8100',
  embeddingDimensions: 1024,
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY || '2'),
  ocrTimeoutMs: 120_000,
  ollamaTimeoutMs: 60_000,
  llmTextLimit: 3000,
  imageMimeTypes: new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/tiff',
  ]),
} as const
