import type { AcceptableValue } from 'reka-ui'
import type { Ref } from 'vue'
import type { DocumentData, PatchDocument } from '@/lib/document-detail'
import { useDocumentOptions } from './useDocumentOptions'
export function useDocumentFields(
  doc: Ref<DocumentData>,
  patchDocument: PatchDocument,
) {
  const { options: allFolders } = useDocumentOptions<{
    id: string
    name: string
    parentId: string | null
  }>('/api/folders/all', 'folders')
  const NONE_SENTINEL = '__none__'
  const selectedFolderValue = () => doc.value.folder?.id ?? NONE_SENTINEL
  async function handleFolderChange(value: AcceptableValue) {
    if (typeof value !== 'string') return
    const prevFolder = doc.value.folder
    const strValue = value
    const newFolderId = strValue === NONE_SENTINEL ? null : strValue
    const newFolder = newFolderId
      ? (allFolders.value.find((f) => f.id === newFolderId) ?? null)
      : null

    doc.value.folder = newFolder
      ? { id: newFolder.id, name: newFolder.name }
      : null

    await patchDocument({ folderId: newFolderId }, () => {
      doc.value.folder = prevFolder
    })
  }

  async function handleDocumentDateChange(value: string | null) {
    const newDate = value && value.trim() ? value.trim() : null
    const prevDate = doc.value.documentDate
    if (newDate === prevDate) return

    doc.value.documentDate = newDate

    await patchDocument({ documentDate: newDate }, () => {
      doc.value.documentDate = prevDate
    })
  }

  function onDocumentDateInput(event: Event) {
    const target = event.target as HTMLInputElement
    void handleDocumentDateChange(target.value)
  }

  return {
    allFolders,
    NONE_SENTINEL,
    selectedFolderValue,
    handleFolderChange,
    handleDocumentDateChange,
    onDocumentDateInput,
  }
}
