import { beforeEach, expect, test, vi } from 'vitest'
import {
  addUserCommand,
  runUserCli,
  setUserPasswordCommand,
  setUserRoleCommand,
  type UserCliAuth,
} from './user-cli'

const PASSWORD = 'a-very-long-password'

function fakeAuth(options: { user?: boolean; credential?: boolean } = {}) {
  const adapter = {
    findUserByEmail: vi.fn(async (email: string) =>
      options.user === false ? null : { user: { id: 'u1', email } },
    ),
    updateUser: vi.fn(async () => ({})),
    findCredentialAccount: vi.fn(async () =>
      options.credential === false ? null : { id: 'a1' },
    ),
    updatePassword: vi.fn(async () => {}),
    createAccount: vi.fn(async () => ({})),
    deleteUserSessions: vi.fn(async () => {}),
  }
  const auth = {
    api: {
      createUser: vi.fn(async ({ body }: { body: { email: string } }) => ({
        user: { email: body.email },
      })),
    },
    $context: Promise.resolve({
      internalAdapter: adapter,
      password: { hash: async (value: string) => `hash:${value}` },
    }),
  } satisfies UserCliAuth
  return { auth, adapter }
}

let output: string[]
beforeEach(() => {
  output = []
  vi.spyOn(console, 'log').mockImplementation((msg) => output.push(msg))
  vi.spyOn(console, 'error').mockImplementation((msg) => output.push(msg))
})

test('add-user keeps positional usage and supports --admin', async () => {
  const { auth } = fakeAuth()
  expect(
    await runUserCli(addUserCommand, ['max@example.com', PASSWORD], auth),
  ).toBe(0)
  expect(auth.api.createUser).toHaveBeenLastCalledWith({
    body: {
      email: 'max@example.com',
      password: PASSWORD,
      name: 'max',
      role: 'user',
    },
  })
  await runUserCli(
    addUserCommand,
    ['--admin', 'eva@example.com', PASSWORD, 'Eva Muster'],
    auth,
  )
  expect(auth.api.createUser).toHaveBeenLastCalledWith({
    body: expect.objectContaining({ name: 'Eva Muster', role: 'admin' }),
  })
  expect(output.at(-1)).toContain('role: admin')
})

test('rejects invalid arguments with usage information', async () => {
  const { auth } = fakeAuth()
  for (const args of [
    ['only@example.com'],
    ['a@example.com', 'short'],
    ['a@example.com', PASSWORD, '--force'],
  ]) {
    expect(await runUserCli(addUserCommand, args, auth)).toBe(1)
    expect(output.at(-1)).toContain('Usage: bun run user:add')
  }
  expect(
    await runUserCli(setUserRoleCommand, ['a@example.com', 'root'], auth),
  ).toBe(1)
  expect(output.at(-1)).toContain('Unknown role "root"')
  expect(auth.api.createUser).not.toHaveBeenCalled()
})

test('reports duplicate users and unexpected failures', async () => {
  const { auth } = fakeAuth()
  auth.api.createUser.mockRejectedValueOnce(
    Object.assign(new Error('exists'), {
      body: { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' },
    }),
  )
  await runUserCli(addUserCommand, ['a@example.com', PASSWORD], auth)
  expect(output.at(-1)).toBe('Error: A user with this email already exists')
  auth.api.createUser.mockRejectedValueOnce('boom')
  await runUserCli(addUserCommand, ['a@example.com', PASSWORD], auth)
  expect(output.at(-1)).toBe('Error: boom')
})

test('sets the role of an existing user', async () => {
  const { auth, adapter } = fakeAuth()
  expect(
    await runUserCli(setUserRoleCommand, ['Max@Example.com', 'admin'], auth),
  ).toBe(0)
  expect(adapter.findUserByEmail).toHaveBeenCalledWith('max@example.com')
  expect(adapter.updateUser).toHaveBeenCalledWith('u1', { role: 'admin' })
})

test('fails when the user does not exist', async () => {
  const { auth, adapter } = fakeAuth({ user: false })
  expect(
    await runUserCli(setUserRoleCommand, ['nobody@example.com', 'user'], auth),
  ).toBe(1)
  expect(output.at(-1)).toContain('No user with email')
  expect(adapter.updateUser).not.toHaveBeenCalled()
})

test('resets a password and revokes all sessions', async () => {
  const { auth, adapter } = fakeAuth()
  await runUserCli(setUserPasswordCommand, ['a@example.com', PASSWORD], auth)
  expect(adapter.updatePassword).toHaveBeenCalledWith('u1', `hash:${PASSWORD}`)
  expect(adapter.deleteUserSessions).toHaveBeenCalledWith('u1')
})

test('creates a credential account for passkey-only users', async () => {
  const { auth, adapter } = fakeAuth({ credential: false })
  await runUserCli(setUserPasswordCommand, ['a@example.com', PASSWORD], auth)
  expect(adapter.createAccount).toHaveBeenCalledWith({
    userId: 'u1',
    providerId: 'credential',
    accountId: 'u1',
    password: `hash:${PASSWORD}`,
  })
  expect(adapter.deleteUserSessions).toHaveBeenCalledWith('u1')
})
