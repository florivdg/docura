import { expect, test, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DocumentToolbar from './DocumentToolbar.vue'
import { detailFixture } from '@/test/document-fixture'

function toolbar(props: { processing?: boolean } = {}) {
  return mount(DocumentToolbar, {
    props: {
      doc: detailFixture(),
      backUrl: '/documents',
      archiving: false,
      deleting: false,
      processing: false,
      reprocessing: false,
      patchDocument: vi.fn(),
      ...props,
    },
    attachTo: document.body,
  })
}

/** A button of the open confirmation dialog (teleported to the body). */
function dialogButton(label: string) {
  return [
    ...document.body.querySelectorAll<HTMLButtonElement>(
      '[role="alertdialog"] button',
    ),
  ].find((button) => button.textContent?.trim() === label)
}

test('saves a renamed document and rolls it back after a failed request', async () => {
  const doc = detailFixture()
  const patchDocument = vi.fn(async (_payload, rollback) => rollback?.())
  const wrapper = mount(DocumentToolbar, {
    props: {
      doc,
      backUrl: '/documents',
      archiving: false,
      deleting: false,
      processing: false,
      reprocessing: false,
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

test('emits reprocess only after the confirmation', async () => {
  const wrapper = toolbar()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Neu verarbeiten')!
    .trigger('click')
  await flushPromises()
  expect(document.body.textContent).toContain(
    'der Titel wird durch den KI-Vorschlag ersetzt',
  )
  expect(wrapper.emitted('reprocess')).toBeUndefined()
  dialogButton('Neu verarbeiten')?.click()
  await flushPromises()
  expect(wrapper.emitted('reprocess')).toHaveLength(1)
})

test('disables reprocessing while a job is pending or running', () => {
  const button = toolbar({ processing: true })
    .findAll('button')
    .find((b) => b.text() === 'Neu verarbeiten')!
  expect(button.attributes()).toHaveProperty('disabled')
  expect(button.attributes('title')).toBe('Verarbeitung läuft bereits')
})

test('confirms moving the document to the trash', async () => {
  const wrapper = toolbar()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Löschen')!
    .trigger('click')
  await flushPromises()
  dialogButton('In den Papierkorb')?.click()
  await flushPromises()
  expect(wrapper.emitted('delete')).toHaveLength(1)
})
