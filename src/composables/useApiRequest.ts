import { ref } from 'vue'
import { apiFetch } from '@/lib/api-fetch'

interface JsonRequest {
  method?: string
  body?: unknown
}

async function send(url: string, { method, body }: JsonRequest) {
  const res = await apiFetch(url, {
    method,
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  // 204 and non-JSON error pages carry no usable body.
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

/**
 * Request state for the app's JSON API: `run` toggles `pending`, stores the
 * server's German `error` (or `fallback`) and resolves to the parsed body on
 * success, `null` otherwise. Bodiless successes (204) resolve to `{}`; without
 * a `request` it is a plain GET.
 */
export function useApiRequest() {
  const pending = ref(false)
  const error = ref('')

  async function run<T>(
    url: string,
    fallback: string,
    request: JsonRequest = {},
  ): Promise<T | null> {
    pending.value = true
    error.value = ''
    try {
      const { ok, data } = await send(url, request)
      if (ok) return data as T
      error.value = typeof data.error === 'string' ? data.error : fallback
    } catch {
      error.value = fallback
    } finally {
      pending.value = false
    }
    return null
  }

  return { pending, error, run }
}
