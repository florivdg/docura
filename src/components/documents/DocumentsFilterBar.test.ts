import { afterEach, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import DocumentsFilterBar from './DocumentsFilterBar.vue'

const options = vi.hoisted(() => ({
  ensureLoaded: vi.fn(),
}))
vi.mock('@/composables/useMetadataOptions', async () => {
  const { ref } = await import('vue')
  return {
    useMetadataOptions: () => ({
      folders: ref([{ id: 'f1', name: 'Steuern' }]),
      tags: ref([{ id: 't1', name: 'Wichtig', color: '#f00' }]),
      correspondents: ref([{ id: 'c1', name: 'Telekom' }]),
      ensureLoaded: options.ensureLoaded,
    }),
  }
})

function bar(overrides = {}) {
  return mount(DocumentsFilterBar, {
    props: {
      query: '',
      searchMode: 'fulltext',
      folderIds: [],
      tagIds: ['t1'],
      correspondentIds: [],
      statuses: [],
      hasActiveFilters: false,
      ...overrides,
    },
    attachTo: document.body,
  })
}

afterEach(() => options.ensureLoaded.mockReset())

test('loads the options and switches the search mode', async () => {
  const wrapper = bar()
  expect(options.ensureLoaded).toHaveBeenCalled()
  const semantic = wrapper.findAll('button[aria-pressed]')[1]
  await semantic.trigger('click')
  expect(wrapper.emitted('update:searchMode')).toEqual([['semantic']])
})

test('shows the number of active values on each filter', () => {
  const wrapper = bar({ statuses: ['failed', 'pending'] })
  const buttons = wrapper.findAll('button').map((b) => b.text())
  expect(buttons).toContain('Tags 1')
  expect(buttons).toContain('Status 2')
  expect(buttons).toContain('Ordner')
})

test('toggles folder options from the popover list', async () => {
  const wrapper = bar()
  const folder = wrapper.findAll('button').find((b) => b.text() === 'Ordner')!
  await folder.trigger('click')
  await flushPromises()
  const item = [...document.body.querySelectorAll('[role="option"]')].find(
    (option) => option.textContent?.includes('Steuern'),
  ) as HTMLElement
  item.click()
  await flushPromises()
  expect(wrapper.emitted('update:folderIds')).toEqual([[['f1']]])
})

test('offers a reset button only while filters are active', async () => {
  const wrapper = bar({ hasActiveFilters: true })
  const buttons = wrapper.findAll('button')
  await buttons[buttons.length - 1].trigger('click')
  expect(wrapper.emitted('clear')).toHaveLength(1)
})
