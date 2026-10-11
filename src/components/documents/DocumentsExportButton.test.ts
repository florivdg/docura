import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import DocumentsExportButton from './DocumentsExportButton.vue'

const HREF = '/api/documents/export?view=archive&tagIds=t1'

function exportButton(
  totalCount: number,
  semanticSearch = false,
  maxDocuments?: number,
) {
  return mount(DocumentsExportButton, {
    props: { href: HREF, totalCount, semanticSearch, maxDocuments },
    global: {
      // Render the tooltip text inline instead of in a hover-only portal.
      stubs: { TooltipContent: { template: '<p role="tooltip"><slot /></p>' } },
    },
  })
}

test('links to the export of the current list with the document count', () => {
  const link = exportButton(12).get('a')
  expect(link.text()).toBe('Exportieren (12)')
  expect(link.attributes('href')).toBe(HREF)
  expect(link.attributes('download')).toBeDefined()
})

test('is disabled with a tooltip for an empty list and for semantic search', () => {
  const empty = exportButton(0)
  expect(empty.find('a').exists()).toBe(false)
  expect(empty.get('button').attributes('disabled')).toBeDefined()
  expect(empty.get('[role="tooltip"]').text()).toBe(
    'Keine Dokumente zum Exportieren',
  )
  const semantic = exportButton(4, true)
  expect(semantic.get('button').attributes('disabled')).toBeDefined()
  expect(semantic.get('[role="tooltip"]').text()).toBe(
    'Nicht verfügbar bei semantischer Suche',
  )
})

test('is disabled when the list exceeds the server export limit', () => {
  const tooMany = exportButton(101, false, 100)
  expect(tooMany.find('a').exists()).toBe(false)
  expect(tooMany.get('button').attributes('disabled')).toBeDefined()
  expect(tooMany.get('[role="tooltip"]').text()).toBe(
    'Zu viele Dokumente für den Export (höchstens 100) – bitte Auswahl einschränken',
  )
  expect(exportButton(100, false, 100).get('a').attributes('href')).toBe(HREF)
})
