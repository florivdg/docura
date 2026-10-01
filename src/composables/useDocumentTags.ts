import { ref } from 'vue'
import type { DocumentTag } from '@/composables/useDocumentsFilter'
import type { Ref } from 'vue'
import type { DocumentData, PatchDocument } from '@/lib/document-detail'
import { useDocumentOptions } from './useDocumentOptions'
export function useDocumentTags(
  doc: Ref<DocumentData>,
  patchDocument: PatchDocument,
) {
  const { options: allTags, reload: fetchAllTags } =
    useDocumentOptions<DocumentTag>('/api/tags', 'tags')
  const tagDialogOpen = ref(false)
  async function handleTagToggle(tagId: string, checked: boolean) {
    const prevTags = [...doc.value.tags]
    let newTagIds: string[]

    if (checked) {
      const tagToAdd = allTags.value.find((t) => t.id === tagId)
      if (tagToAdd) doc.value.tags = [...doc.value.tags, tagToAdd]
      newTagIds = doc.value.tags.map((t) => t.id)
    } else {
      doc.value.tags = doc.value.tags.filter((t) => t.id !== tagId)
      newTagIds = doc.value.tags.map((t) => t.id)
    }

    await patchDocument({ tagIds: newTagIds }, () => {
      doc.value.tags = prevTags
    })
  }

  async function handleTagRemove(tagId: string) {
    await handleTagToggle(tagId, false)
  }

  function isTagAssigned(tagId: string): boolean {
    return doc.value?.tags.some((t) => t.id === tagId) ?? false
  }

  async function handleTagCreated(tag: {
    id: string
    name: string
    color: string | null
  }) {
    tagDialogOpen.value = false
    await fetchAllTags()
    await handleTagToggle(tag.id, true)
  }

  return {
    allTags,
    tagDialogOpen,
    isTagAssigned,
    handleTagToggle,
    handleTagRemove,
    handleTagCreated,
  }
}
