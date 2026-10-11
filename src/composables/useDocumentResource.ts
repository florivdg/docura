import { computed, onMounted, ref } from 'vue'
import { apiFetch } from '@/lib/api-fetch'
import { useProcessingEvents } from './useProcessingEvents'
import { applyDocumentProcessingEvent } from '@/lib/document-processing-event'
import type { DocumentData } from '@/lib/document-detail'
/** `onChange` runs after every successful save or reload of the document. */
export function useDocumentResource(
  documentId: string,
  onChange: () => void = () => {},
) {
  const doc = ref<DocumentData | null>(null)
  const loading = ref(true)
  const notFound = ref(false)
  const error = ref(false)
  /** PATCHt das Dokument; bei Fehlern wird die optimistische Änderung zurückgerollt. */
  async function patchDocument(
    payload: Record<string, unknown>,
    rollback?: () => void,
  ) {
    try {
      const res = await apiFetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        doc.value = data.document
        onChange()
      } else {
        rollback?.()
      }
    } catch {
      rollback?.()
    }
  }

  onMounted(async () => {
    try {
      const docRes = await apiFetch(`/api/documents/${documentId}`)

      if (docRes.status === 404) {
        notFound.value = true
        return
      }
      if (!docRes.ok) {
        error.value = true
        return
      }

      const docData = await docRes.json()
      doc.value = docData.document
    } catch {
      error.value = true
    } finally {
      loading.value = false
    }
  })

  async function refetchDocument() {
    try {
      const res = await apiFetch(`/api/documents/${documentId}`)
      if (res.ok) {
        const data = await res.json()
        doc.value = data.document
        onChange()
      }
    } catch {
      // ignore
    }
  }

  /** A job is queued or running; disables a new reprocess request. */
  const hasActiveProcessing = computed(
    () =>
      doc.value?.processingJobs.some(
        (j) => j.status === 'pending' || j.status === 'processing',
      ) ?? false,
  )

  /**
   * Also listens while a failed attempt has a retry ahead (e.g. after a
   * stale-job reset): the retry reuses the job id, so its events update the
   * row and the toolbar.
   */
  const watchProcessing = computed(
    () =>
      hasActiveProcessing.value ||
      (doc.value?.processingJobs.some(
        (j) => j.status === 'failed' && j.attempts < j.maxAttempts,
      ) ??
        false),
  )

  useProcessingEvents(
    (event) => {
      if (!doc.value || event.documentId !== documentId) return

      if (applyDocumentProcessingEvent(doc.value, event)) void refetchDocument()
    },
    { enabled: watchProcessing },
  )

  return {
    doc,
    loading,
    notFound,
    error,
    patchDocument,
    hasActiveProcessing,
    refetchDocument,
  }
}
