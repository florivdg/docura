#!/usr/bin/env bun
import { probeRedis } from '@/lib/server/system-status'
import { summarizeHeartbeat } from '@/lib/system-status'

// Healthcheck of the worker container (bun run worker:health).
// Exit codes: 0 worker alive, 1 no current heartbeat or Redis unreachable.
// probeRedis gives up after WORKER_CONFIG.statusCheckTimeoutMs; the explicit
// exit closes the Redis connection that would keep the process alive.
const worker = summarizeHeartbeat(await probeRedis())
if (worker.status === 'ok') {
  console.log(`Worker aktiv (zuletzt gesehen ${worker.lastSeen})`)
  process.exit(0)
}
console.error(
  worker.status === 'down'
    ? 'Kein aktueller Worker-Heartbeat'
    : 'Redis nicht erreichbar',
)
process.exit(1)
