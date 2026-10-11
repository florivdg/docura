import type { APIRoute } from 'astro'
import { jsonResponse } from '@/lib/json-response'
import { collectSystemStatus } from '@/lib/server/system-status'

export const GET: APIRoute = async () =>
  jsonResponse(await collectSystemStatus(), 200, {
    'Cache-Control': 'no-store',
  })
