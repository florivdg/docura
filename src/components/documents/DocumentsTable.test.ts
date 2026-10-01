import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import DocumentsTable from './DocumentsTable.vue'
import { rowFixture } from '@/test/document-fixture'
test('sorts columns and emits selected IDs through the split table', async () => {
  const wrapper = mount(DocumentsTable, {
    props: {
      documents: [rowFixture()],
      loading: false,
      selectedIds: [],
      sortColumn: null,
      sortOrder: 'desc',
    },
  })
  await wrapper.get('button[aria-label="Nach Name sortieren"]').trigger('click')
  expect(wrapper.emitted('sort')).toEqual([['name']])
  await wrapper.get('[aria-label="Alle Dokumente auswählen"]').trigger('click')
  expect(wrapper.emitted('update:selectedIds')?.[0]).toEqual([
    [rowFixture().id],
  ])
  wrapper.unmount()
})
test('shows an empty trash state and restores a trashed row', async () => {
  const wrapper = mount(DocumentsTable, {
    props: {
      documents: [],
      loading: false,
      selectedIds: [],
      sortColumn: null,
      sortOrder: 'desc',
      view: 'trash',
    },
  })
  expect(wrapper.text()).toContain('Der Papierkorb ist leer')
  await wrapper.setProps({
    documents: [rowFixture({ trashedAt: '2026-01-01T00:00:00Z' })],
  })
  // Restore action precedes permanent delete in each trash row.
  await wrapper.findAll('tbody button')[1].trigger('click')
  expect(wrapper.emitted('restore')).toEqual([[rowFixture().id]])
  wrapper.unmount()
})
