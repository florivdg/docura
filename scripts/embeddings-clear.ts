#!/usr/bin/env bun
import { clearAllEmbeddings } from '@/db/embeddings'

// Step 2 of README "Changing the embedding model": a populated vector column
// cannot change its dimension, so the old vectors go before db:migrate.
const cleared = await clearAllEmbeddings()
console.log(`${cleared} Einbettung(en) gelöscht.`)
console.log('Nächste Schritte:')
console.log(
  '  1. OLLAMA_EMBED_MODEL setzen und ggf. EMBEDDING_DIMENSIONS ändern',
)
console.log('  2. bun run db:generate (nur bei geänderter Dimension)')
console.log('  3. bun run db:migrate')
console.log('  4. Worker starten: bun run worker')
console.log('  5. bun run embeddings:reembed')
process.exit(0)
