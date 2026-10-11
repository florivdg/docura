import { expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import Dashboard from './Dashboard.vue'
import { useProcessingEvents } from '@/composables/useProcessingEvents'

vi.mock('@/composables/useProcessingEvents', () => ({
  useProcessingEvents: vi.fn(),
}))

const group = { batchId: 'b', action: 'uploaded', count: 1 }

function respond(url: string): Response {
  const body = url.startsWith('/api/activity')
    ? { entries: [group] }
    : { stats: { documentCount: 3 }, documentsByType: [] }
  return new Response(JSON.stringify(body))
}

test('loads stats and activity and reloads them after changes', async () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (url) => respond(url as string))
  const wrapper = shallowMount(Dashboard, {
    global: { renderStubDefaultSlot: true },
  })
  await flushPromises()
  const urls = () => fetch.mock.calls.map(([url]) => url)
  expect(urls()).toEqual(['/api/dashboard/stats', '/api/activity'])
  const recent = wrapper.getComponent({ name: 'RecentActivity' })
  expect(recent.props()).toEqual({ entries: [group], loading: false })

  window.dispatchEvent(new Event('document-uploaded'))
  await flushPromises()
  expect(fetch).toHaveBeenCalledTimes(4)

  // A burst of finished jobs reloads once, after the trailing delay.
  vi.useFakeTimers()
  const onEvent = vi.mocked(useProcessingEvents).mock.lastCall![0]
  onEvent({ type: 'step_change' } as never)
  onEvent({ type: 'completed' } as never)
  onEvent({ type: 'failed' } as never)
  await vi.advanceTimersByTimeAsync(1000)
  onEvent({ type: 'completed' } as never)
  await vi.advanceTimersByTimeAsync(1000)
  expect(fetch).toHaveBeenCalledTimes(4)
  await vi.advanceTimersByTimeAsync(500)
  vi.useRealTimers()
  await flushPromises()
  expect(fetch).toHaveBeenCalledTimes(6)
  wrapper.unmount()
})

test('shows why the dashboard could not be loaded', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
    (url as string).startsWith('/api/activity')
      ? new Response('{}', { status: 500 })
      : respond(url as string),
  )
  const wrapper = shallowMount(Dashboard, {
    global: { renderStubDefaultSlot: true },
  })
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe(
    'Aktivitäten konnten nicht geladen werden',
  )
  wrapper.unmount()
})
