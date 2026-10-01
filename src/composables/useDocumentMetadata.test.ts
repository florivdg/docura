import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent, ref, type Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useDocumentFields } from './useDocumentFields'
import { useDocumentTags } from './useDocumentTags'
import { useDocumentCorrespondent } from './useDocumentCorrespondent'
import { detailFixture } from '@/test/document-fixture'
import type { DocumentData, PatchDocument } from '@/lib/document-detail'
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
function setup<T>(
  hook: (doc: Ref<DocumentData>, patch: PatchDocument) => T,
  patch: PatchDocument = async () => {},
) {
  const doc = ref(detailFixture())
  let result: T
  const wrapper = mount(
    defineComponent({
      setup() {
        result = hook(doc, patch)
        return () => null
      },
    }),
  )
  wrappers.push(wrapper)
  return { doc, state: result! }
}
function optionsFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const data: Record<string, unknown> = {
      '/api/folders/all': {
        folders: [{ id: 'folder', name: 'Steuern', parentId: null }],
      },
      '/api/tags': { tags: [{ id: 'tag', name: 'Steuer', color: null }] },
      '/api/correspondents': {
        correspondents: [{ id: 'sender', name: 'Telekom' }],
      },
    }
    return new Response(
      JSON.stringify(
        data[
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url
        ],
      ),
    )
  })
}
test('metadata fields roll back failed folder and date changes', async () => {
  optionsFetch()
  const patch = vi.fn(async (_payload, rollback) => rollback?.())
  const { doc, state } = setup(useDocumentFields, patch)
  await flushPromises()
  await state.handleFolderChange('folder')
  expect(patch).toHaveBeenCalledWith(
    { folderId: 'folder' },
    expect.any(Function),
  )
  expect(doc.value.folder).toBeNull()
  await state.handleDocumentDateChange('2026-01-01')
  expect(doc.value.documentDate).toBeNull()
  await state.handleFolderChange('__none__')
  expect(patch).toHaveBeenLastCalledWith(
    { folderId: null },
    expect.any(Function),
  )
})
test('tags can be added, removed, and refreshed after creation', async () => {
  optionsFetch()
  const patch = vi.fn(async () => {})
  const { doc, state } = setup(useDocumentTags, patch)
  await flushPromises()
  await state.handleTagToggle('tag', true)
  expect(state.isTagAssigned('tag')).toBe(true)
  expect(patch).toHaveBeenCalledWith({ tagIds: ['tag'] }, expect.any(Function))
  await state.handleTagRemove('tag')
  expect(doc.value.tags).toEqual([])
  await state.handleTagCreated({ id: 'tag', name: 'Steuer', color: null })
  expect(doc.value.tags).toHaveLength(1)
})
test('correspondent selection rolls back and duplicate selections are ignored', async () => {
  optionsFetch()
  const patch = vi.fn(async (_payload, rollback) => rollback?.())
  const { doc, state } = setup(useDocumentCorrespondent, patch)
  await flushPromises()
  state.handleCorrespondentSelect({ id: 'sender', name: 'Telekom' })
  await flushPromises()
  expect(doc.value.correspondent).toBeNull()
  expect(patch).toHaveBeenCalledWith(
    { correspondentId: 'sender' },
    expect.any(Function),
  )
  patch.mockClear()
  state.handleCorrespondentSelect(null)
  expect(patch).not.toHaveBeenCalled()
})
test('creates a correspondent and assigns the returned record', async () => {
  const fetch = optionsFetch()
  const patch = vi.fn(async () => {})
  const { doc, state } = setup(useDocumentCorrespondent, patch)
  await flushPromises()
  state.correspondentSearch.value = ' Neue Firma '
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ correspondent: { id: 'new', name: 'Neue Firma' } }),
    ),
  )
  await state.handleCorrespondentCreate()
  expect(doc.value.correspondent?.id).toBe('new')
  expect(state.allCorrespondents.value).toHaveLength(2)
  expect(state.creatingCorrespondent.value).toBe(false)
})
