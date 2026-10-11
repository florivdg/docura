// @vitest-environment node
import { beforeAll, expect, test, vi } from 'vitest'

const BASE_URL = 'http://localhost:4321'

vi.hoisted(() => {
  process.env.BETTER_AUTH_URL = 'http://localhost:4321'
  process.env.BETTER_AUTH_SECRET = 'test-secret-test-secret-test-secret-123'
  process.env.PASSKEY_RP_ID = 'localhost'
  process.env.PASSKEY_ORIGIN = 'http://localhost:4321'
  process.env.SMTP_HOST = ''
})
vi.mock('@/db', () => ({ db: {} }))
vi.mock('better-auth/adapters/drizzle', async () => {
  const { memoryAdapter } = await import('better-auth/adapters/memory')
  const store = {
    user: [],
    session: [],
    account: [],
    verification: [],
    passkey: [],
  }
  return { drizzleAdapter: () => memoryAdapter(store) }
})

const { auth } = await import('./auth')

const ADMIN = { email: 'admin@example.com', password: 'admin-password-1234' }
let adminId = ''
let adminHeaders = new Headers()

function authRequest(path: string, body: unknown, headers?: Headers) {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE_URL,
        Cookie: headers?.get('cookie') ?? '',
      },
      body: JSON.stringify(body),
    }),
  )
}

async function signIn(credentials: { email: string; password: string }) {
  const res = await authRequest('/sign-in/email', credentials)
  expect(res.status).toBe(200)
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0])
  return new Headers({ cookie: cookie.join('; ') })
}

async function sessionOf(headers: Headers) {
  return auth.api.getSession({ headers })
}

beforeAll(async () => {
  const { user } = await auth.api.createUser({
    body: { ...ADMIN, name: 'Admin', role: 'admin' },
  })
  adminId = user.id
  adminHeaders = await signIn(ADMIN)
})

test('rejects public sign-up', async () => {
  const res = await authRequest('/sign-up/email', {
    email: 'stranger@example.com',
    password: 'stranger-password-123',
    name: 'Stranger',
  })
  expect(res.status).toBe(400)
  expect(await res.json()).toMatchObject({
    code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
  })
})

test('still creates users through the admin plugin', async () => {
  const created = await authRequest(
    '/admin/create-user',
    {
      email: 'new@example.com',
      password: 'new-user-password-12',
      name: 'Neu',
      role: 'user',
    },
    adminHeaders,
  )
  expect(created.status).toBe(200)
  await signIn({ email: 'new@example.com', password: 'new-user-password-12' })
})

test('enforces the password policy on create-user', async () => {
  await expect(
    auth.api.createUser({
      body: { email: 'short@example.com', password: 'kurz', name: 'Kurz' },
    }),
  ).rejects.toMatchObject({ body: { code: 'PASSWORD_TOO_SHORT' } })
})

test('rejects password reset requests without SMTP', async () => {
  const res = await authRequest('/request-password-reset', {
    email: ADMIN.email,
  })
  expect(res.status).toBe(400)
  expect(await res.json()).toMatchObject({ code: 'RESET_PASSWORD_DISABLED' })
})

test('prevents admins from changing their own role', async () => {
  for (const [path, body] of [
    ['/admin/set-role', { userId: adminId, role: 'user' }],
    ['/admin/update-user', { userId: adminId, data: { role: 'user' } }],
    ['/admin/set-role', { userId: [adminId], role: 'user' }],
    ['/admin/update-user', { userId: [adminId], data: { role: 'user' } }],
  ] as const) {
    const res = await authRequest(path, body, adminHeaders)
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({
      code: 'YOU_CANNOT_CHANGE_YOUR_OWN_ROLE',
    })
  }
})

test('relies on the admin plugin to block banning or removing yourself', async () => {
  for (const [path, body, code] of [
    ['/admin/ban-user', { userId: adminId }, 'YOU_CANNOT_BAN_YOURSELF'],
    [
      '/admin/update-user',
      { userId: adminId, data: { banned: true } },
      'YOU_CANNOT_BAN_YOURSELF',
    ],
    ['/admin/remove-user', { userId: adminId }, 'YOU_CANNOT_REMOVE_YOURSELF'],
  ] as const) {
    const res = await authRequest(path, body, adminHeaders)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code })
  }
})

test('revokes all sessions when an admin sets a password', async () => {
  const credentials = {
    email: 'revoke@example.com',
    password: 'revoke-password-1234',
  }
  const { user } = await auth.api.createUser({
    body: { ...credentials, name: 'Revoke' },
  })
  const userHeaders = await signIn(credentials)
  expect(await sessionOf(userHeaders)).not.toBeNull()

  const rejected = await authRequest(
    '/admin/set-user-password',
    { userId: user.id, newPassword: 'kurz' },
    adminHeaders,
  )
  expect(rejected.status).toBe(400)
  expect(await sessionOf(userHeaders)).not.toBeNull()

  const res = await authRequest(
    '/admin/set-user-password',
    { userId: user.id, newPassword: 'new-revoke-password-12' },
    adminHeaders,
  )
  expect(res.status).toBe(200)
  expect(await sessionOf(userHeaders)).toBeNull()
  expect(await sessionOf(adminHeaders)).not.toBeNull()

  // The admin plugin coerces `userId`, so an array-wrapped id must revoke too.
  const reloggedHeaders = await signIn({
    ...credentials,
    password: 'new-revoke-password-12',
  })
  expect(await sessionOf(reloggedHeaders)).not.toBeNull()
  const coerced = await authRequest(
    '/admin/set-user-password',
    { userId: [user.id], newPassword: 'third-revoke-password-1' },
    adminHeaders,
  )
  expect(coerced.status).toBe(200)
  expect(await sessionOf(reloggedHeaders)).toBeNull()
  expect(await sessionOf(adminHeaders)).not.toBeNull()
})

test('lets admins change the role of other users but not regular users', async () => {
  const { user } = await auth.api.createUser({
    body: {
      email: 'other@example.com',
      password: 'other-password-12345',
      name: 'Andere',
    },
  })
  const promoted = await authRequest(
    '/admin/set-role',
    { userId: user.id, role: 'admin' },
    adminHeaders,
  )
  expect(promoted.status).toBe(200)
  const forbidden = await authRequest(
    '/admin/set-role',
    { userId: adminId, role: 'user' },
    await signIn({
      email: 'new@example.com',
      password: 'new-user-password-12',
    }),
  )
  expect(forbidden.status).toBe(403)
})
