import { expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CorrespondentsTable from './CorrespondentsTable.vue'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-fetch', () => ({ apiFetch }))

const rows = [
  {
    id: 'c1',
    name: 'Deutsche Telekom AG',
    createdAt: '2026-01-01T00:00:00Z',
    documentCount: 4,
  },
  {
    id: 'c2',
    name: 'Telekom',
    createdAt: '2026-02-01T00:00:00Z',
    documentCount: 1,
  },
  {
    id: 'c3',
    name: 'Stadtwerke',
    createdAt: '2026-03-01T00:00:00Z',
    documentCount: 0,
  },
]

function reply(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status })
}

function listReply(list = rows) {
  return reply({ correspondents: list })
}

async function table(list = rows) {
  apiFetch.mockResolvedValueOnce(listReply(list))
  const wrapper = mount(CorrespondentsTable, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

function bodyButton(label: string) {
  return [...document.body.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  )
}

function rowCheckbox(wrapper: Awaited<ReturnType<typeof table>>, id: string) {
  return wrapper.find(
    `tr[data-correspondent-id="${id}"] button[role="checkbox"]`,
  )
}

test('lists correspondents with counts and links to their documents', async () => {
  const wrapper = await table()
  expect(apiFetch).toHaveBeenCalledWith(
    '/api/correspondents?counts=1',
    expect.anything(),
  )
  const items = wrapper.findAll('tr[data-correspondent-id]')
  expect(items).toHaveLength(3)
  expect(items[0].text()).toContain('Deutsche Telekom AG')
  expect(items[0].text()).toContain('4')
  expect(items[0].text()).toContain('01.01.2026')
  expect(items[0].find('a').attributes('href')).toBe(
    '/documents?correspondents=c1',
  )
})

test('shows an empty state and load errors', async () => {
  apiFetch.mockResolvedValueOnce(reply({}, 500))
  const wrapper = mount(CorrespondentsTable)
  await flushPromises()
  expect(wrapper.text()).toContain('Keine Korrespondenten vorhanden')
  expect(wrapper.text()).toContain(
    'Korrespondenten konnten nicht geladen werden.',
  )
})

test('merges the selected rows into the chosen target', async () => {
  const wrapper = await table()
  const mergeButton = () =>
    wrapper.findAll('button').find((b) => b.text().includes('Zusammenführen'))!
  expect(mergeButton().attributes()).toHaveProperty('disabled')
  await rowCheckbox(wrapper, 'c1').trigger('click')
  await rowCheckbox(wrapper, 'c2').trigger('click')
  expect(mergeButton().attributes()).not.toHaveProperty('disabled')
  await mergeButton().trigger('click')
  await flushPromises()
  expect(document.body.textContent).toContain('Korrespondenten zusammenführen')
  apiFetch.mockResolvedValueOnce(
    reply({ correspondent: rows[0], movedDocuments: 1 }),
  )
  apiFetch.mockResolvedValueOnce(listReply([rows[0], rows[2]]))
  bodyButton('Zusammenführen')?.click()
  await flushPromises()
  expect(apiFetch).toHaveBeenCalledWith('/api/correspondents/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId: 'c1', sourceIds: ['c2'] }),
  })
  expect(wrapper.text()).toContain(
    '2 Korrespondenten wurden zu „Deutsche Telekom AG“ zusammengeführt (1 Dokument neu zugeordnet, inklusive Archiv und Papierkorb).',
  )
  expect(wrapper.findAll('tr[data-correspondent-id]')).toHaveLength(2)
  expect(mergeButton().attributes()).toHaveProperty('disabled')
})

test('selects all rows from the header checkbox', async () => {
  const wrapper = await table()
  await wrapper.find('thead button[role="checkbox"]').trigger('click')
  expect(wrapper.text()).toContain('Zusammenführen (3)')
  await rowCheckbox(wrapper, 'c3').trigger('click')
  expect(wrapper.text()).toContain('Zusammenführen (2)')
})

test('deletes a correspondent after confirmation and reports failures', async () => {
  const wrapper = await table()
  await wrapper.find('button[aria-label="Telekom löschen"]').trigger('click')
  await flushPromises()
  expect(document.body.textContent).toContain('Dokumente bleiben erhalten')
  await rowCheckbox(wrapper, 'c2').trigger('click')
  apiFetch.mockResolvedValueOnce(reply(null, 204))
  bodyButton('Löschen')?.click()
  await flushPromises()
  expect(apiFetch).toHaveBeenLastCalledWith('/api/correspondents/c2', {
    method: 'DELETE',
    headers: undefined,
    body: undefined,
  })
  expect(wrapper.text()).toContain('Korrespondent „Telekom“ wurde gelöscht.')
  expect(wrapper.find('tr[data-correspondent-id="c2"]').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('Zusammenführen (')
  await wrapper.find('button[aria-label="Stadtwerke löschen"]').trigger('click')
  await flushPromises()
  apiFetch.mockRejectedValueOnce(new Error('offline'))
  bodyButton('Löschen')?.click()
  await flushPromises()
  expect(wrapper.text()).toContain(
    'Korrespondent konnte nicht gelöscht werden.',
  )
})

test('applies created, renamed and already existing correspondents locally', async () => {
  const wrapper = await table()
  const requests = apiFetch.mock.calls.length
  const dialog = () => wrapper.findComponent({ name: 'CorrespondentDialog' })
  const names = () =>
    wrapper.findAll('tr[data-correspondent-id] a').map((a) => a.text())
  await wrapper.find('button[aria-label="Telekom umbenennen"]').trigger('click')
  expect(dialog().props('correspondent')).toEqual(rows[1])
  dialog().vm.$emit('saved', { id: 'c2', name: 'Abwasser' }, 'renamed')
  await flushPromises()
  expect(wrapper.text()).toContain('Korrespondent „Abwasser“ wurde umbenannt.')
  expect(names()).toEqual(['Abwasser', 'Deutsche Telekom AG', 'Stadtwerke'])
  const create = wrapper
    .findAll('button')
    .find((b) => b.text().includes('Neuer Korrespondent'))!
  await create.trigger('click')
  expect(dialog().props('correspondent')).toBeNull()
  dialog().vm.$emit(
    'saved',
    { id: 'c1', name: 'Deutsche Telekom AG' },
    'existing',
  )
  await flushPromises()
  expect(wrapper.text()).toContain(
    'Korrespondent „Deutsche Telekom AG“ existiert bereits.',
  )
  dialog().vm.$emit('saved', { id: 'c9', name: 'Bank' }, 'created')
  await flushPromises()
  expect(wrapper.text()).toContain('Korrespondent „Bank“ wurde angelegt.')
  expect(names()).toEqual([
    'Abwasser',
    'Bank',
    'Deutsche Telekom AG',
    'Stadtwerke',
  ])
  expect(wrapper.find('tr[data-correspondent-id="c9"]').text()).toContain('0')
  // Saves are applied locally without reloading the list.
  expect(apiFetch.mock.calls.length).toBe(requests)
})
