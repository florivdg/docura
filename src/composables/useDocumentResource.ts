import { computed, onMounted, ref } from 'vue'
import { apiFetch } from '@/lib/api-fetch'
import { useProcessingEvents } from './useProcessingEvents'
import { applyDocumentProcessingEvent } from '@/lib/document-processing-event'
import type { DocumentData } from '@/lib/document-detail'
export function useDocumentResource(documentId: string) {
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
      }
    } catch {
      // ignore
    }
  }

  const hasActiveProcessing = computed(
    () =>
      doc.value?.processingJobs.some(
        (j) => j.status === 'pending' || j.status === 'processing',
      ) ?? false,
  )

  useProcessingEvents(
    (event) => {
      if (!doc.value || event.documentId !== documentId) return

      if (applyDocumentProcessingEvent(doc.value, event)) void refetchDocument()
    },
    { enabled: hasActiveProcessing },
  )

  return { doc, loading, notFound, error, patchDocument }
}
