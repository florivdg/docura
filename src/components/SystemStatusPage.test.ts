import { afterEach, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SystemStatusPage from './SystemStatusPage.vue'
import type { SystemStatus } from '@/lib/system-status'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-fetch', () => ({ apiFetch }))

const ok = { status: 'ok', latencyMs: 4, error: null } as const
const fixture: SystemStatus = {
  checkedAt: '2026-01-01T12:00:00.000Z',
  worker: { status: 'down', lastSeen: null },
  services: {
    database: ok,
    redis: ok,
    ocr: { status: 'error', latencyMs: null, error: 'Zeitüberschreitung' },
    ollama: {
      ...ok,
      models: {
        embed: { name: 'mxbai-embed-large', available: true },
        llm: { name: 'llama3', available: true },
      },
    },
  },
  queue: {
    pending: 4,
    processing: 0,
    failedRetrying: 1,
    failed: 2,
    oldestPendingAt: '2026-01-01T11:00:00.000Z',
  },
}

function page() {
  return mount(SystemStatusPage, {
    global: { stubs: { PageLayout: { template: '<div><slot /></div>' } } },
  })
}

afterEach(() => apiFetch.mockReset())

test('renders service states and queue counts from the status endpoint', async () => {
  apiFetch.mockResolvedValue(Response.json(fixture))
  const wrapper = page()
  await flushPromises()
  const card = (key: string) => wrapper.find(`[data-service="${key}"]`).text()
  expect(card('worker')).toContain('Nicht aktiv')
  expect(card('database')).toContain('Erreichbar')
  expect(card('ocr')).toContain('Zeitüberschreitung')
  expect(card('ollama')).toContain('mxbai-embed-large (installiert)')
  expect(wrapper.text()).toContain('davon mit geplantem erneuten Versuch')
  const failed = wrapper.find('a[href="/documents?status=failed"]')
  expect(failed.text()).toBe('2')
})

test('reloads on demand and shows load errors', async () => {
  apiFetch.mockResolvedValueOnce(Response.json(fixture))
  const wrapper = page()
  await flushPromises()
  apiFetch.mockResolvedValueOnce(new Response('', { status: 500 }))
  await wrapper.find('button').trigger('click')
  await flushPromises()
  expect(apiFetch).toHaveBeenCalledTimes(2)
  expect(wrapper.text()).toContain(
    'Der Systemstatus konnte nicht geladen werden.',
  )
  // The last good state stays visible.
  expect(wrapper.find('[data-service="worker"]').exists()).toBe(true)
})

test('shows that queue counts need the database', async () => {
  apiFetch.mockResolvedValue(Response.json({ ...fixture, queue: null }))
  const wrapper = page()
  await flushPromises()
  expect(wrapper.text()).toContain('Ohne Datenbankverbindung nicht verfügbar.')
})
