// @vitest-environment node -- happy-dom drops the forbidden Origin header
import { expect, test, vi } from 'vitest'
import { originRejection, unauthenticatedResponse } from './request-guard'

const APP = 'https://docura.lan'

function request(method: string, origin?: string) {
  return new Request(`${APP}/api/documents`, {
    method,
    headers: origin ? { Origin: origin } : {},
  })
}

test('answers API requests without session with 401 and redirects pages', async () => {
  const redirect = vi.fn(() => new Response(null, { status: 302 }))
  const api = unauthenticatedResponse('/api/documents', redirect)
  expect(api.status).toBe(401)
  expect(api.headers.get('Content-Type')).toBe('application/json')
  expect(await api.json()).toEqual({ error: 'Nicht authentifiziert' })
  expect(redirect).not.toHaveBeenCalled()
  expect(unauthenticatedResponse('/documents', redirect).status).toBe(302)
  expect(redirect).toHaveBeenCalledOnce()
})

test('allows reads, non-API requests and mutations from the app origin', () => {
  expect(originRejection(request('GET'), '/api/documents', APP)).toBeNull()
  expect(originRejection(request('POST'), '/upload', APP)).toBeNull()
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE'])
    expect(
      originRejection(request(method, APP), '/api/documents', `${APP}/`),
    ).toBeNull()
})

test('rejects mutations with a missing, foreign or invalid origin', async () => {
  const cases: [string | undefined, string | undefined][] = [
    [undefined, APP],
    ['https://evil.example', APP],
    ['not a url', APP],
    [APP, undefined],
    [APP, 'not a url'],
  ]
  for (const [origin, allowed] of cases) {
    const response = originRejection(
      request('POST', origin),
      '/api/documents',
      allowed,
    )
    expect(response?.status).toBe(403)
    expect(await response?.json()).toEqual({ error: 'Ungültiger Origin' })
  }
})
