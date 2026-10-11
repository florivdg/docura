import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import DocumentProcessingHistory from './DocumentProcessingHistory.vue'
import { jobFixture as job } from '@/test/document-fixture'

test('labels embedding-only runs, steps and errors', () => {
  const wrapper = mount(DocumentProcessingHistory, {
    props: {
      jobs: [
        job({
          id: 'a',
          kind: 'embedding',
          status: 'processing',
          step: 'embedding',
        }),
        job({
          id: 'b',
          status: 'failed',
          step: 'custom',
          errorMessage: 'OCR offline',
        }),
      ],
    },
  })
  const text = wrapper.text()
  expect(text).toContain('Nur Einbettung')
  expect(text).toContain('Einbettung')
  expect(text).toContain('custom')
  expect(text).toContain('OCR offline')
})

test('shows an empty state without jobs', () => {
  const wrapper = mount(DocumentProcessingHistory, { props: { jobs: [] } })
  expect(wrapper.text()).toContain('Keine Verarbeitungsvorgänge')
})
