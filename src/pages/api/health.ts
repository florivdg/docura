import type { APIRoute } from 'astro'
import { jsonResponse } from '@/lib/json-response'
import { probeDatabase } from '@/lib/server/system-status'

/**
 * Liveness for container healthchecks; public (see isPublicPath), so it only
 * reports whether the database answers, without any details.
 */
export const GET: APIRoute = async () => {
  const database = await probeDatabase()
  const ok = database.status === 'ok'
  return jsonResponse(
    ok
      ? { status: 'ok', database: 'ok' }
      : { status: 'error', database: 'error' },
    ok ? 200 : 503,
    { 'Cache-Control': 'no-store' },
  )
}
