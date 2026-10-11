/**
 * Dimension of `document.embedding`; must match the output of
 * `OLLAMA_EMBED_MODEL`. Changing it requires a generated migration and
 * re-embedding all documents (see README, "Changing the embedding model").
 */
export const EMBEDDING_DIMENSIONS = 1024
