import { ref, watch } from 'vue'
import { apiFetch } from '@/lib/api-fetch'
import type { DocumentCorrespondent } from '@/lib/document-detail'
import type { Ref } from 'vue'
import type { DocumentData, PatchDocument } from '@/lib/document-detail'
import { useDocumentOptions } from './useDocumentOptions'
export function useDocumentCorrespondent(
  doc: Ref<DocumentData>,
  patchDocument: PatchDocument,
) {
  const { options: allCorrespondents } =
    useDocumentOptions<DocumentCorrespondent>(
      '/api/correspondents',
      'correspondents',
    )
  const correspondentPopoverOpen = ref(false)
  const correspondentSearch = ref('')
  const creatingCorrespondent = ref(false)
  watch(correspondentPopoverOpen, (open) => {
    if (!open) correspondentSearch.value = ''
  })
  async function applyCorrespondent(next: DocumentCorrespondent | null) {
    const prevCorrespondent = doc.value.correspondent
    if ((prevCorrespondent?.id ?? null) === (next?.id ?? null)) return

    doc.value.correspondent = next

    await patchDocument({ correspondentId: next?.id ?? null }, () => {
      doc.value.correspondent = prevCorrespondent
    })
  }

  function handleCorrespondentSelect(next: DocumentCorrespondent | null) {
    correspondentPopoverOpen.value = false
    void applyCorrespondent(next)
  }

  async function handleCorrespondentCreate() {
    const name = correspondentSearch.value.trim()
    if (!name || creatingCorrespondent.value) return

    creatingCorrespondent.value = true
    try {
      const res = await apiFetch('/api/correspondents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) return

      const data = await res.json()
      const created = data.correspondent as DocumentCorrespondent
      if (!allCorrespondents.value.some((c) => c.id === created.id)) {
        allCorrespondents.value = [...allCorrespondents.value, created].sort(
          (a, b) => a.name.localeCompare(b.name, 'de'),
        )
      }
      correspondentPopoverOpen.value = false
      await applyCorrespondent(created)
    } catch {
      // ignore
    } finally {
      creatingCorrespondent.value = false
    }
  }

  return {
    allCorrespondents,
    correspondentPopoverOpen,
    correspondentSearch,
    creatingCorrespondent,
    handleCorrespondentSelect,
    handleCorrespondentCreate,
  }
}
