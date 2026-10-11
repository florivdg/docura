import { expect, test } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ReprocessDialog from './ReprocessDialog.vue'

function dialog(props: { name?: string; count?: number }) {
  return mount(ReprocessDialog, {
    props: { open: true, ...props },
    attachTo: document.body,
  })
}

test('names a single document and explains which metadata is kept', async () => {
  dialog({ name: 'Rechnung.pdf' })
  await flushPromises()
  const text = document.body.textContent
  expect(text).toContain('„Rechnung.pdf“ neu verarbeiten?')
  expect(text).toContain(
    'Manuell gesetzte Ordner, Korrespondenten und Belegdaten bleiben erhalten',
  )
  expect(text).not.toContain('übersprungen')
})

test('counts a selection and mentions skipped documents', async () => {
  const wrapper = dialog({ count: 3 })
  await flushPromises()
  expect(document.body.textContent).toContain('3 Dokumente neu verarbeiten?')
  expect(document.body.textContent).toContain('werden übersprungen')
  const confirm = [...document.body.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Neu verarbeiten',
  )
  confirm?.click()
  await flushPromises()
  expect(wrapper.emitted('confirm')).toHaveLength(1)
})

test('uses the singular for one selected document', async () => {
  dialog({ count: 1 })
  await flushPromises()
  expect(document.body.textContent).toContain('1 Dokument neu verarbeiten?')
})
