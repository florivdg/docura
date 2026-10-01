import {
  afterEach,
  describe,
  expect,
  vi,
  test,
  type MockInstance,
} from 'vitest'

import { chatWithOllama } from '@/worker/clients/ollama'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function chatReply(content: string) {
  return jsonResponse({ message: { role: 'assistant', content } })
}

function requestBodies(fetchSpy: MockInstance<typeof fetch>) {
  return fetchSpy.mock.calls.map(([, init]) =>
    JSON.parse((init as RequestInit).body as string),
  )
}

/** Resolves to a thrower so the rejection can be asserted with `toThrow`. */
async function chatError(): Promise<() => never> {
  const error: unknown = await chatWithOllama('system', 'user').then(
    () => new Error('expected chatWithOllama to reject'),
    (err: unknown) => err,
  )
  return () => {
    throw error
  }
}

describe('chatWithOllama', () => {
  let fetchSpy: MockInstance<typeof fetch>

  afterEach(() => fetchSpy.mockRestore())

  test('requests structured JSON output and returns the message content', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(chatReply('{"a":1}'))

    expect(await chatWithOllama('system', 'user')).toBe('{"a":1}')

    const [body] = requestBodies(fetchSpy)
    expect(body.format).toBe('json')
    expect(body.stream).toBe(false)
    expect(body.messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'user' },
    ])
  })

  test('retries without structured output when the model does not support it', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ error: 'structured output is unavailable' }, 501),
      )
      .mockResolvedValueOnce(chatReply('plain'))

    expect(await chatWithOllama('system', 'user')).toBe('plain')

    const [first, second] = requestBodies(fetchSpy)
    expect(first.format).toBe('json')
    expect(second).not.toHaveProperty('format')
  })

  test('does not retry other 501 errors', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ error: 'something else' }, 501))

    expect(await chatError()).toThrow('LLM-Anfrage fehlgeschlagen: 501')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  test('throws on other HTTP errors', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('boom', { status: 500 }))

    expect(await chatError()).toThrow('LLM-Anfrage fehlgeschlagen: 500')
  })
})
