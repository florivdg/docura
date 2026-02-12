#!/usr/bin/env bun
import { startWorker } from '@/worker/worker-loop'

void startWorker().catch((error) => {
  console.error('Worker konnte nicht starten:', error)
  process.exit(1)
})
