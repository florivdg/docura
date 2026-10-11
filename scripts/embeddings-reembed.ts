#!/usr/bin/env bun
import { enqueueReembedding } from '@/db/embeddings'

// Queues embedding-only jobs; the worker reuses the stored text, so scans are
// not OCRed again. --all also replaces existing vectors.
const all = process.argv.slice(2).includes('--all')
const { queued, skipped } = await enqueueReembedding(all)
console.log(
  `${queued} Dokument(e) zur Einbettung eingeplant, ${skipped} übersprungen (Papierkorb oder laufende Verarbeitung).`,
)
process.exit(0)
