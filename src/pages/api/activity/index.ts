import type { APIRoute } from 'astro'
import { loadActivityGroups } from '@/db/activity-feed'
import { jsonResponse } from '@/lib/json-response'
import { readActivityLimit } from '@/lib/activity'

/** The newest activity batches for the dashboard (`limit`, default 10, max 50). */
export const GET: APIRoute = async ({ url }) =>
  jsonResponse({
    entries: await loadActivityGroups(readActivityLimit(url.searchParams)),
  })
