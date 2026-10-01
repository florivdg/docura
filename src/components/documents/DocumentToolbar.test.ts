import { expect, test, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DocumentToolbar from './DocumentToolbar.vue'
import { detailFixture } from '@/test/document-fixture'
test('saves a renamed document and rolls it back after a failed request', async () => {
  const doc = detailFixture()
  const patchDocument = vi.fn(async (_payload, rollback) => rollback?.())
  const wrapper = mount(DocumentToolbar, {
    props: {
      doc,
      backUrl: '/documents',
      archiving: false,
      deleting: false,
      patchDocument,
    },
  })
  await wrapper.find('h1').trigger('click')
  await wrapper.find('input').setValue(' Neue Rechnung ')
  await wrapper.find('input').trigger('keydown.enter')
  await flushPromises()
  expect(patchDocument).toHaveBeenCalledWith(
    { name: 'Neue Rechnung' },
    expect.any(Function),
  )
  expect(doc.name).toBe('Rechnung.pdf')
  wrapper.unmount()
})
