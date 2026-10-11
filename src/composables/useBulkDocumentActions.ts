import { ref, watch, type Ref, type WatchSource } from 'vue'
import type { BulkAction } from '@/lib/document-bulk'
import { reprocessNotice } from '@/lib/document-reprocess'
import { useApiRequest } from './useApiRequest'

export interface BulkPayload {
  action: BulkAction
  folderId?: string | null
  tagIds?: string[]
}

interface BulkResponse {
  queued?: string[]
  skipped?: unknown[]
}

/**
 * Selection and bulk actions of the document list. The selection belongs to
 * the visible result set: it is cleared when `requestInputs` (filters, view,
 * page) change, and ids that a refetch no longer returns are pruned.
 */
export function useBulkDocumentActions(
  documents: Ref<{ id: string }[]>,
  fetchDocuments: () => Promise<void>,
  requestInputs: WatchSource[],
) {
  const selectedIds = ref<string[]>([])
  const notice = ref('')
  const { pending, error, run } = useApiRequest()

  function clearSelection() {
    selectedIds.value = []
  }

  async function runBulkAction(payload: BulkPayload) {
    if (selectedIds.value.length === 0 || pending.value) return
    notice.value = ''
    const result = await run<BulkResponse>(
      '/api/documents/bulk',
      'Massenaktion fehlgeschlagen.',
      { method: 'POST', body: { ids: [...selectedIds.value], ...payload } },
    )
    if (!result) return
    if (payload.action === 'reprocess')
      notice.value = reprocessNotice(
        result.queued?.length ?? 0,
        result.skipped?.length ?? 0,
      )
    clearSelection()
    await fetchDocuments()
  }

  watch(requestInputs, clearSelection, { deep: true })

  // Shallow on purpose: fetchDocuments() reassigns documents.value wholesale,
  // while live processing events only mutate row fields in place.
  watch(documents, (docs) => {
    const ids = new Set(docs.map((d) => d.id))
    const pruned = selectedIds.value.filter((id) => ids.has(id))
    if (pruned.length !== selectedIds.value.length) selectedIds.value = pruned
  })

  return {
    selectedIds,
    bulkPending: pending,
    bulkError: error,
    bulkNotice: notice,
    clearSelection,
    runBulkAction,
  }
}
