import { onMounted, ref } from 'vue'
import { apiFetch } from '@/lib/api-fetch'
export function useDocumentOptions<T>(url: string, key: string) {
  const options = ref<T[]>([])
  async function reload() {
    try {
      const response = await apiFetch(url)
      if (response.ok) options.value = (await response.json())[key] ?? []
    } catch {
      /* An unavailable options request does not block the document. */
    }
  }
  onMounted(reload)
  return { options, reload }
}
