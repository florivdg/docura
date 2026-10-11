import { expect, test } from 'vitest'
import { isPublicPath } from './public-paths'

test('exempts login pages, the health check and Better Auth endpoints', () => {
  for (const path of [
    '/login',
    '/reset-password',
    '/api/health',
    '/api/auth',
    '/api/auth/sign-in/email',
    '/api/auth/passkey/generate-authenticate-options',
  ])
    expect(isPublicPath(path), path).toBe(true)
})

test('protects everything else, including look-alike paths', () => {
  for (const path of [
    '/',
    '/documents',
    '/login/extra',
    '/api/health/details',
    '/api/authx',
    '/api/documents',
    '/api/system/status',
  ])
    expect(isPublicPath(path), path).toBe(false)
})
