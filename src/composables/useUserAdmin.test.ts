import { expect, test, vi } from 'vitest'
import { USER_ACTIONS, useUserAdmin } from './useUserAdmin'

const admin = vi.hoisted(() => ({
  listUsers: vi.fn(),
  setRole: vi.fn(),
  banUser: vi.fn(),
  unbanUser: vi.fn(),
  removeUser: vi.fn(),
}))
vi.mock('@/lib/auth-client', () => ({ authClient: { admin } }))

const max = {
  id: 'u2',
  name: 'Max',
  email: 'max@example.com',
  role: 'user',
  banned: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
}
const eva = { ...max, id: 'u3', name: 'Eva', email: 'eva@example.com' }

async function loaded() {
  admin.listUsers.mockResolvedValueOnce({
    data: { users: [max, eva] },
    error: null,
  })
  const state = useUserAdmin()
  await state.fetchUsers()
  return state
}

test('loads users and reports load failures in German', async () => {
  const state = await loaded()
  expect(state.users.value).toEqual([max, eva])
  expect(state.loading.value).toBe(false)
  admin.listUsers.mockResolvedValueOnce({
    data: null,
    error: { code: 'YOU_ARE_NOT_ALLOWED_TO_LIST_USERS' },
  })
  await state.fetchUsers()
  expect(state.error.value).toContain('Berechtigung')
  admin.listUsers.mockRejectedValueOnce(new Error('offline'))
  await state.fetchUsers()
  expect(state.error.value).toBe('Benutzer konnten nicht geladen werden.')
})

test('maps every row action to the admin plugin endpoint', async () => {
  const state = await loaded()
  for (const fn of [admin.setRole, admin.banUser, admin.unbanUser]) {
    fn.mockResolvedValue({ data: { user: max }, error: null })
  }
  admin.removeUser.mockResolvedValue({ data: { success: true }, error: null })
  expect(await state.runAction('promote', max)).toBe(true)
  expect(admin.setRole).toHaveBeenLastCalledWith({
    userId: 'u2',
    role: 'admin',
  })
  await state.runAction('demote', max)
  expect(admin.setRole).toHaveBeenLastCalledWith({ userId: 'u2', role: 'user' })
  await state.runAction('ban', max)
  expect(admin.banUser).toHaveBeenCalledWith({ userId: 'u2' })
  await state.runAction('unban', max)
  expect(admin.unbanUser).toHaveBeenCalledWith({ userId: 'u2' })
  await state.runAction('remove', max)
  expect(admin.removeUser).toHaveBeenCalledWith({ userId: 'u2' })
  expect(admin.listUsers).toHaveBeenCalledTimes(1)
})

test('applies action results to the list without reloading it', async () => {
  const state = await loaded()
  const promoted = { ...eva, role: 'admin' }
  admin.setRole.mockResolvedValueOnce({ data: { user: promoted }, error: null })
  await state.runAction('promote', eva)
  expect(state.users.value).toEqual([max, promoted])
  admin.removeUser.mockResolvedValueOnce({
    data: { success: true },
    error: null,
  })
  await state.runAction('remove', max)
  expect(state.users.value).toEqual([promoted])
})

test('keeps the list and shows the failure when an action is rejected', async () => {
  const state = await loaded()
  admin.banUser.mockResolvedValueOnce({
    data: null,
    error: { code: 'YOU_CANNOT_BAN_YOURSELF' },
  })
  expect(await state.runAction('ban', max)).toBe(false)
  expect(state.error.value).toBe('Sie können sich nicht selbst sperren.')
  expect(state.users.value).toEqual([max, eva])
})

test('provides confirmation and success copy for every action', () => {
  for (const copy of Object.values(USER_ACTIONS)) {
    expect(copy.description('Max')).toContain('Max')
    expect(copy.success('Max')).toContain('Max')
  }
})
