import { afterEach, expect, test, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import DocumentDetail from './DocumentDetail.vue'
import { detailFixture, jobFixture } from '@/test/document-fixture'
import { useProcessingEvents } from '@/composables/useProcessingEvents'
vi.mock('@/composables/useProcessingEvents', () => ({
  useProcessingEvents: vi.fn(),
}))
const wrappers: ReturnType<typeof shallowMount>[] = []
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
function page() {
  const wrapper = shallowMount(DocumentDetail, {
    props: { documentId: detailFixture().id },
  })
  wrappers.push(wrapper)
  return wrapper
}
test('renders missing and failed load states', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('', { status: 404 }),
  )
  const missing = page()
  await flushPromises()
  expect(missing.text()).toContain('Dokument nicht gefunden')
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('offline'))
  const failed = page()
  await flushPromises()
  expect(failed.text()).toContain('Fehler beim Laden')
})
test('rolls back an optimistic favorite when saving fails', async () => {
  const doc = detailFixture()
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ document: doc })))
    .mockResolvedValueOnce(new Response('', { status: 500 }))
  const wrapper = page()
  await flushPromises()
  wrapper.getComponent({ name: 'DocumentToolbar' }).vm.$emit('favorite')
  await flushPromises()
  expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toEqual({
    isFavorite: true,
  })
  expect(
    wrapper.getComponent({ name: 'DocumentToolbar' }).props('doc').isFavorite,
  ).toBe(false)
})
test('archives and restores through the existing PATCH payloads', async () => {
  const doc = detailFixture({ trashedAt: '2026-01-01T00:00:00Z' })
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ document: doc })))
  const wrapper = page()
  await flushPromises()
  wrapper.getComponent({ name: 'DocumentStateBanner' }).vm.$emit('restore')
  await flushPromises()
  expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toEqual({
    trashedAt: null,
  })
  wrapper.getComponent({ name: 'DocumentToolbar' }).vm.$emit('archive')
  await flushPromises()
  expect(JSON.parse(fetch.mock.calls[2][1]!.body as string)).toHaveProperty(
    'archivedAt',
  )
})
test('reprocesses through the API and reloads the document', async () => {
  const doc = detailFixture()
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ document: doc })))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ job: { id: 'job' } }), { status: 201 }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ document: doc })))
  const wrapper = page()
  await flushPromises()
  expect(
    wrapper.getComponent({ name: 'DocumentToolbar' }).props('processing'),
  ).toBe(false)
  wrapper.getComponent({ name: 'DocumentToolbar' }).vm.$emit('reprocess')
  await flushPromises()
  expect(fetch.mock.calls[1][0]).toBe(`/api/documents/${doc.id}/reprocess`)
  expect(fetch).toHaveBeenCalledTimes(3)
})
test('keeps listening for events while a failed job has a retry ahead', async () => {
  const listening = () =>
    vi.mocked(useProcessingEvents).mock.lastCall?.[1]?.enabled
  for (const [attempts, expected] of [
    [1, true],
    [3, false],
  ] as const) {
    const doc = detailFixture({
      processingJobs: [jobFixture({ status: 'failed', attempts })],
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ document: doc })),
    )
    const wrapper = page()
    await flushPromises()
    expect(listening()).toMatchObject({ value: expected })
    expect(
      wrapper.getComponent({ name: 'DocumentToolbar' }).props('processing'),
    ).toBe(false)
  }
})
