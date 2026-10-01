import { computed, ref, type Ref } from 'vue'
import { apiFetch } from '@/lib/api-fetch'
import type { DocumentData, PatchDocument } from '@/lib/document-detail'
export function useDocumentActions(
  documentId: string,
  doc: Ref<DocumentData | null>,
  patchDocument: PatchDocument,
) {
  const deleting = ref(false)
  async function handleDelete() {
    deleting.value = true
    try {
      const res = await apiFetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        window.location.href = '/documents'
      } else {
        console.error('Dokument löschen fehlgeschlagen:', res.status)
        window.alert('Fehler beim Löschen des Dokuments.')
      }
    } catch (err) {
      console.error('Dokument löschen fehlgeschlagen:', err)
      window.alert('Fehler beim Löschen des Dokuments.')
    } finally {
      deleting.value = false
    }
  }

  const restoring = ref(false)
  const permanentlyDeleting = ref(false)
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

  async function handlePermanentDelete() {
    permanentlyDeleting.value = true
    try {
      const res = await apiFetch(
        `/api/documents/${documentId}?permanent=true`,
        { method: 'DELETE' },
      )
      if (res.ok) {
        window.location.href = '/documents?view=trash'
      } else {
        window.alert('Fehler beim endgültigen Löschen des Dokuments.')
      }
    } catch {
      window.alert('Fehler beim endgültigen Löschen des Dokuments.')
    } finally {
      permanentlyDeleting.value = false
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
    backUrl,
    toggleFavorite,
    handleRestore,
    handleDelete,
    handlePermanentDelete,
    handleArchive,
    handleUnarchive,
  }
}
