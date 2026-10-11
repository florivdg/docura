import { ref } from 'vue'
import { authRequestError } from '@/lib/auth-errors'

type AuthResult = Awaited<ReturnType<Parameters<typeof authRequestError>[0]>>

/**
 * Request state for Better Auth client calls: `run` toggles `pending`, stores
 * a German `error` and resolves to the response on success, `null` otherwise.
 */
export function useAuthRequest() {
  const pending = ref(false)
  const error = ref('')

  async function run<R extends AuthResult>(
    request: () => Promise<R>,
    fallback: string,
  ): Promise<R | null> {
    const response: { value?: R } = {}
    pending.value = true
    error.value = await authRequestError(async () => {
      response.value = await request()
      return response.value
    }, fallback)
    pending.value = false
    return error.value ? null : (response.value ?? null)
  }

  return { pending, error, run }
}
