import { computed, ref } from 'vue'
import { useApiRequest } from '@/composables/useApiRequest'
import type { CorrespondentRecord } from '@/db/correspondents'
import { documentUrlParams, parseDocumentUrl } from '@/lib/document-url'

export interface CorrespondentRow extends CorrespondentRecord {
  createdAt: string
  /** Active documents (neither trashed nor archived). */
  documentCount: number
}

/** How a dialog save ended: POST may answer with an existing correspondent. */
export type SaveOutcome = 'created' | 'existing' | 'renamed'

interface MergeResult {
  correspondent: CorrespondentRecord
  movedDocuments: number
}

const API = '/api/correspondents'

const SAVE_NOTICES: Record<SaveOutcome, string> = {
  created: 'wurde angelegt',
  existing: 'existiert bereits',
  renamed: 'wurde umbenannt',
}

/** Document list filtered by one correspondent (same URL as the filter bar). */
export function documentsHref(correspondentId: string): string {
  const state = { ...parseDocumentUrl(''), correspondentIds: [correspondentId] }
  return `/documents?${documentUrlParams(state)}`
}

function documentsLabel(count: number): string {
  return count === 1 ? '1 Dokument' : `${count} Dokumente`
}

function byName(a: CorrespondentRow, b: CorrespondentRow): number {
  return a.name.localeCompare(b.name, 'de')
}

export function useCorrespondentAdmin() {
  const correspondents = ref<CorrespondentRow[]>([])
  const selectedIds = ref<string[]>([])
  const loading = ref(true)
  const notice = ref('')
  const { pending, error, run } = useApiRequest()

  const selectedSet = computed(() => new Set(selectedIds.value))
  const selected = computed(() =>
    correspondents.value.filter((row) => selectedSet.value.has(row.id)),
  )

  async function fetchCorrespondents() {
    loading.value = true
    const data = await run<{ correspondents: CorrespondentRow[] }>(
      `${API}?counts=1`,
      'Korrespondenten konnten nicht geladen werden.',
    )
    if (data) correspondents.value = data.correspondents
    // Drop selections of rows that no longer exist.
    selectedIds.value = selected.value.map((row) => row.id)
    loading.value = false
  }

  /** Applies a dialog save locally: rename in place or add a new row. */
  function saved(row: CorrespondentRecord, outcome: SaveOutcome) {
    // StatusMessage prefers the error, so a stale one would hide the notice.
    error.value = ''
    notice.value = `Korrespondent „${row.name}“ ${SAVE_NOTICES[outcome]}.`
    const known = correspondents.value.some(({ id }) => id === row.id)
    const rows = known
      ? correspondents.value.map((c) =>
          c.id === row.id ? { ...c, name: row.name } : c,
        )
      : [
          ...correspondents.value,
          { ...row, createdAt: new Date().toISOString(), documentCount: 0 },
        ]
    correspondents.value = rows.sort(byName)
  }

  async function remove(row: CorrespondentRow) {
    notice.value = ''
    const done = await run(
      `${API}/${row.id}`,
      'Korrespondent konnte nicht gelöscht werden.',
      { method: 'DELETE' },
    )
    if (!done) return
    correspondents.value = correspondents.value.filter((c) => c.id !== row.id)
    selectedIds.value = selectedIds.value.filter((id) => id !== row.id)
    notice.value = `Korrespondent „${row.name}“ wurde gelöscht.`
  }

  /** Merge moves documents in archive and trash too, so counts are refetched. */
  async function merge(targetId: string) {
    notice.value = ''
    const sourceIds = selectedIds.value.filter((id) => id !== targetId)
    const result = await run<MergeResult>(
      `${API}/merge`,
      'Korrespondenten konnten nicht zusammengeführt werden.',
      { method: 'POST', body: { targetId, sourceIds } },
    )
    if (!result) return
    selectedIds.value = []
    notice.value = `${sourceIds.length + 1} Korrespondenten wurden zu „${result.correspondent.name}“ zusammengeführt (${documentsLabel(result.movedDocuments)} neu zugeordnet, inklusive Archiv und Papierkorb).`
    await fetchCorrespondents()
  }

  return {
    correspondents,
    selectedIds,
    selectedSet,
    selected,
    loading,
    pending,
    notice,
    error,
    fetchCorrespondents,
    saved,
    remove,
    merge,
  }
}
