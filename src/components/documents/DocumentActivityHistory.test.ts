import { expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import DocumentActivityHistory from './DocumentActivityHistory.vue'
import { entryFixture as entry } from '@/test/activity-fixture'

const documentId = '11111111-1111-4111-8111-111111111111'

function page(entries: ReturnType<typeof entry>[], total = entries.length) {
  return new Response(JSON.stringify({ entries, total, page: 1, pageSize: 20 }))
}

test('shows sentences and change lines and loads more on request', async () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      page(
        [
          entry({
            id: 'e2',
            actorType: 'system',
            actorName: 'KI-Analyse',
            action: 'updated',
            changes: {
              folder: { from: null, to: { id: 'f', name: 'Steuer' } },
              tags: { from: [], to: [{ id: 't', name: 'Rechnung' }] },
            },
          }),
        ],
        2,
      ),
    )
    .mockResolvedValueOnce(page([entry()], 2))
  const wrapper = mount(DocumentActivityHistory, { props: { documentId } })
  await flushPromises()
  expect(fetch.mock.calls[0][0]).toBe(
    `/api/documents/${documentId}/activity?page=1&size=20`,
  )
  expect(wrapper.text()).toContain('KI-Analyse hat die Metadaten geändert')
  expect(wrapper.text()).toContain('Automatisch')
  expect(wrapper.text()).toContain('Ordner: – → Steuer')
  expect(wrapper.text()).toContain('Tags: +Rechnung')
  const more = wrapper
    .findAll('button')
    .find((b) => b.text() === 'Mehr anzeigen')
  await more!.trigger('click')
  await flushPromises()
  expect(fetch.mock.calls[1][0]).toContain('page=2')
  expect(wrapper.text()).toContain('Anna hat das Dokument hochgeladen')
  expect(wrapper.findAll('li')[1].text()).not.toContain('Automatisch')
  expect(wrapper.text()).not.toContain('Mehr anzeigen')
})

test('reloads the first page when the revision changes', async () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(page([]))
    .mockResolvedValueOnce(page([entry({ action: 'trashed' })]))
  const wrapper = mount(DocumentActivityHistory, {
    props: { documentId, revision: 0 },
  })
  await flushPromises()
  expect(wrapper.text()).toContain('Noch keine Einträge')
  await wrapper.setProps({ revision: 1 })
  await flushPromises()
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(wrapper.text()).toContain(
    'Anna hat das Dokument in den Papierkorb verschoben',
  )
})

test('shows an error when the history cannot be loaded', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
  const wrapper = mount(DocumentActivityHistory, { props: { documentId } })
  await flushPromises()
  expect(wrapper.text()).toContain('Verlauf konnte nicht geladen werden')
})

function clickMore(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .findAll('button')
    .find((b) => b.text() === 'Mehr anzeigen')!
    .trigger('click')
}

test('skips entries that moved to the next page in the meantime', async () => {
  const first = Array.from({ length: 20 }, (_, i) => entry({ id: `e${i}` }))
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(page(first, 22))
    // One entry was recorded since: page 2 starts with page 1's last entry.
    .mockResolvedValueOnce(
      page(
        [
          first[19],
          entry({ id: 'e20', action: 'trashed' }),
          entry({ id: 'e21' }),
        ],
        23,
      ),
    )
  const wrapper = mount(DocumentActivityHistory, { props: { documentId } })
  await flushPromises()
  await clickMore(wrapper)
  await flushPromises()
  expect(wrapper.findAll('li')).toHaveLength(22)
  expect(wrapper.text()).toContain(
    'Anna hat das Dokument in den Papierkorb verschoben',
  )
  // Both pages are loaded; the new entry shows up after a refresh.
  expect(wrapper.text()).not.toContain('Mehr anzeigen')
})

test('keeps the loaded entries when loading more fails', async () => {
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(page([entry()], 2))
    .mockRejectedValueOnce(new Error('offline'))
  const wrapper = mount(DocumentActivityHistory, { props: { documentId } })
  await flushPromises()
  await clickMore(wrapper)
  await flushPromises()
  expect(wrapper.text()).toContain('Anna hat das Dokument hochgeladen')
  expect(wrapper.text()).toContain('Verlauf konnte nicht geladen werden')
})

test('ignores a page that was still loading when the history refreshed', async () => {
  const first = Array.from({ length: 20 }, (_, i) => entry({ id: `e${i}` }))
  let resolveStale!: (response: Response) => void
  const stale = new Promise<Response>((resolve) => (resolveStale = resolve))
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(page(first, 40))
    .mockReturnValueOnce(stale)
    .mockResolvedValueOnce(
      page([entry({ id: 'new' }), ...first.slice(0, 19)], 41),
    )
  const wrapper = mount(DocumentActivityHistory, {
    props: { documentId, revision: 0 },
  })
  await flushPromises()
  void clickMore(wrapper)
  await wrapper.setProps({ revision: 1 })
  await flushPromises()
  resolveStale(
    page(
      Array.from({ length: 20 }, (_, i) => entry({ id: `e${i + 20}` })),
      40,
    ),
  )
  await flushPromises()
  expect(wrapper.findAll('li')).toHaveLength(20)
  expect(wrapper.text()).toContain('Mehr anzeigen')
})
