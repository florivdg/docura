import { computed, ref, type Ref } from 'vue'
import type { DocumentData, PatchDocument } from '@/lib/document-detail'
import { useApiRequest } from './useApiRequest'

/**
 * One API action with its own pending state; failures show the server's
 * reason (or `fallback`) in an alert.
 */
function useAlertingAction(
  url: string,
  method: string,
  fallback: string,
  onSuccess: () => void | Promise<void>,
) {
  const { pending, error, run } = useApiRequest()
  async function execute() {
    if (await run(url, fallback, { method })) await onSuccess()
    else window.alert(error.value)
  }
  return [pending, execute] as const
}

function navigate(url: string) {
  window.location.href = url
}

export function useDocumentActions(
  documentId: string,
  doc: Ref<DocumentData | null>,
  patchDocument: PatchDocument,
  refetchDocument: () => Promise<void>,
) {
  const documentUrl = `/api/documents/${documentId}`
  const [deleting, handleDelete] = useAlertingAction(
    documentUrl,
    'DELETE',
    'Fehler beim Löschen des Dokuments.',
    () => navigate('/documents'),
  )
  const [permanentlyDeleting, handlePermanentDelete] = useAlertingAction(
    `${documentUrl}?permanent=true`,
    'DELETE',
    'Fehler beim endgültigen Löschen des Dokuments.',
    () => navigate('/documents?view=trash'),
  )
  // The refetch shows the new pending job and reconnects the live progress.
  const [reprocessing, handleReprocess] = useAlertingAction(
    `${documentUrl}/reprocess`,
    'POST',
    'Fehler beim Starten der Neuverarbeitung.',
    refetchDocument,
  )

  const restoring = ref(false)
  const archiving = ref(false)

  const backUrl = computed(() => {
    if (doc.value?.trashedAt) return '/documents?view=trash'
    if (doc.value?.archivedAt) return '/documents?view=archive'
    return '/documents'
  })

  async function toggleFavorite() {
    if (!doc.value) return
    const prev = doc.value.isFavorite
    doc.value.isFavorite = !prev
    await patchDocument({ isFavorite: !prev }, () => {
      if (doc.value) doc.value.isFavorite = prev
    })
  }

  async function handleRestore() {
    if (!doc.value) return
    restoring.value = true
    try {
      await patchDocument({ trashedAt: null })
    } finally {
      restoring.value = false
    }
  }

  async function handleArchive() {
    if (!doc.value) return
    archiving.value = true
    try {
      await patchDocument({ archivedAt: new Date().toISOString() })
    } finally {
      archiving.value = false
    }
  }

  async function handleUnarchive() {
    if (!doc.value) return
    archiving.value = true
    try {
      await patchDocument({ archivedAt: null })
    } finally {
      archiving.value = false
    }
  }

  return {
    deleting,
    restoring,
    permanentlyDeleting,
    archiving,
    reprocessing,
    backUrl,
    toggleFavorite,
    handleRestore,
    handleDelete,
    handlePermanentDelete,
    handleArchive,
    handleUnarchive,
    handleReprocess,
  }
}
