import { beforeEach } from 'vitest'
import type { APIContext, APIRoute } from 'astro'
import type { createDbStub } from './db-stub'

interface RouteRequest {
  /** JSON-encoded unless already a string (e.g. deliberately broken JSON). */
  body?: unknown
  id?: string
  /** Path and query string of the request URL. */
  path?: string
}

/** The signed-in user the middleware would put into `locals`. */
export const TEST_USER = { id: 'user-1', name: 'Test User' }

/**
 * Route contract test scaffolding: empties the stub's queues before each test
 * and returns `call`, which invokes an Astro route with a minimal context.
 */
export function routeCaller(
  stub: ReturnType<typeof createDbStub>,
  defaultId: string,
) {
  beforeEach(stub.reset)

  return async function call(
    route: APIRoute,
    { body, id = defaultId, path = '/' }: RouteRequest = {},
  ): Promise<Response> {
    const response = await route({
      params: { id },
      locals: { user: TEST_USER },
      url: new URL(path, 'http://localhost'),
      request: new Request('http://localhost', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    } as unknown as APIContext)
    return response as Response
  }
}
