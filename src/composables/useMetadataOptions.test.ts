import { afterEach, describe, expect, spyOn, test } from 'bun:test'

import { useMetadataOptions } from '@/composables/useMetadataOptions'

const RESPONSES: Record<string, unknown> = {
  '/api/folders/all': {
    folders: [{ id: 'f1', name: 'Steuern', parentId: null }],
  },
  '/api/tags': {
    tags: [{ id: 't1', name: 'Rechnung', color: '#f00', documentCount: 3 }],
  },
  '/api/correspondents': { correspondents: [{ id: 'c1', name: 'Telekom' }] },
}

function mockApi(status = 200) {
  return spyOn(globalThis, 'fetch').mockImplementation(
    (async (url: string) =>
      new Response(JSON.stringify(RESPONSES[url]), {
        status,
      })) as unknown as typeof fetch,
  )
}

// The composable keeps module-level state, so these tests run in order and
// build on each other: a failed load first, then a successful retry.
describe('useMetadataOptions', () => {
  let fetchSpy: ReturnType<typeof mockApi>

  afterEach(() => fetchSpy.mockRestore())

  test('keeps options empty and allows a retry when a request fails', async () => {
    fetchSpy = mockApi(500)
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {})

    const { folders, tags, correspondents, ensureLoaded } = useMetadataOptions()
    await ensureLoaded()

    expect(folders.value).toEqual([])
    expect(tags.value).toEqual([])
    expect(correspondents.value).toEqual([])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  test('loads options once and shares them between callers', async () => {
    fetchSpy = mockApi()

    const first = useMetadataOptions()
    const second = useMetadataOptions()
    await Promise.all([first.ensureLoaded(), second.ensureLoaded()])
    await first.ensureLoaded()

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(second.folders.value).toEqual([
      { id: 'f1', name: 'Steuern', parentId: null },
    ])
    expect(second.tags.value).toEqual([
      { id: 't1', name: 'Rechnung', color: '#f00' },
    ])
    expect(second.correspondents.value).toEqual([{ id: 'c1', name: 'Telekom' }])
  })
})
