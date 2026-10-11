import { computed, onMounted, ref } from 'vue'
import type { ActivityEntry } from '@/lib/activity'
import { useApiRequest } from './useApiRequest'

interface ActivityPage {
  entries: ActivityEntry[]
  total: number
}

const PAGE_SIZE = 20

/** A document's history, newest first, loaded page by page. */
export function useDocumentActivity(documentId: string) {
  const entries = ref<ActivityEntry[]>([])
  const total = ref(0)
  const page = ref(0)
  const { pending: loading, error, run } = useApiRequest()

  /** Rows the server returned, duplicates included: the next page's offset. */
  const received = ref(0)

  // Not by shown entries: entries recorded after page 1 shift the offsets and
  // only show up after a refresh, so the shown count would stay short.
  const hasMore = computed(() => received.value < total.value)

  /** The table is append-only with new rows on top: drift only duplicates. */
  function append(more: ActivityEntry[]) {
    const known = new Set(entries.value.map(({ id }) => id))
    return [...entries.value, ...more.filter(({ id }) => !known.has(id))]
  }

  /** A refresh starts a new generation; older responses are then discarded. */
  let generation = 0

  async function load(next: number) {
    const token = next === 1 ? ++generation : generation
    const data = await run<ActivityPage>(
      `/api/documents/${documentId}/activity?page=${next}&size=${PAGE_SIZE}`,
      'Verlauf konnte nicht geladen werden',
    )
    if (!data || token !== generation) return
    entries.value = next === 1 ? data.entries : append(data.entries)
    received.value = (next === 1 ? 0 : received.value) + data.entries.length
    total.value = data.total
    page.value = next
  }

  /** Reloads the first page, e.g. after the document changed. */
  const refresh = () => load(1)
  const loadMore = () => load(page.value + 1)

  onMounted(refresh)

  return { entries, loading, error, hasMore, loadMore, refresh }
}
