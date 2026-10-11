import { ref, watch } from 'vue'
import { useApiRequest } from './useApiRequest'
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
  const { pending: creatingCorrespondent, run } = useApiRequest()
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

    // Failures are silent here: the popover stays open for another attempt.
    const data = await run<{ correspondent: DocumentCorrespondent }>(
      '/api/correspondents',
      'Korrespondent konnte nicht erstellt werden.',
      { method: 'POST', body: { name } },
    )
    if (!data) return

    const created = data.correspondent
    if (!allCorrespondents.value.some((c) => c.id === created.id)) {
      allCorrespondents.value = [...allCorrespondents.value, created].sort(
        (a, b) => a.name.localeCompare(b.name, 'de'),
      )
    }
    correspondentPopoverOpen.value = false
    await applyCorrespondent(created)
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
