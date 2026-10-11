import { expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import UsersTable from './UsersTable.vue'

const admin = vi.hoisted(() => ({
  listUsers: vi.fn(),
  setRole: vi.fn(),
  banUser: vi.fn(),
  unbanUser: vi.fn(),
  removeUser: vi.fn(),
  createUser: vi.fn(),
  setUserPassword: vi.fn(),
}))
vi.mock('@/lib/auth-client', () => ({ authClient: { admin } }))

const users = [
  {
    id: 'me',
    name: 'Ich',
    email: 'ich@example.com',
    role: 'admin',
    banned: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'u2',
    name: 'Max',
    email: 'max@example.com',
    role: 'user',
    banned: true,
    createdAt: '2026-02-01T00:00:00Z',
  },
]

async function table() {
  admin.listUsers.mockResolvedValue({ data: { users }, error: null })
  const wrapper = mount(UsersTable, {
    props: { currentUserId: 'me' },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

test('lists users with role and status and locks the own row', async () => {
  const wrapper = await table()
  const rows = wrapper.findAll('tr[data-user-id]')
  expect(rows).toHaveLength(2)
  expect(rows[0].text()).toContain('Sie')
  expect(rows[0].text()).toContain('Administrator')
  expect(rows[0].find('button').attributes()).toHaveProperty('disabled')
  expect(rows[0].text()).toContain('01.01.2026')
  expect(rows[1].text()).toContain('Gesperrt')
  expect(rows[1].find('button').attributes()).not.toHaveProperty('disabled')
})

test('shows an empty state and load errors', async () => {
  admin.listUsers.mockResolvedValue({ data: null, error: { code: 'X' } })
  const wrapper = mount(UsersTable, { props: { currentUserId: 'me' } })
  await flushPromises()
  expect(wrapper.text()).toContain('Keine Benutzer vorhanden')
  expect(wrapper.text()).toContain('Benutzer konnten nicht geladen werden.')
})

function menu(wrapper: Awaited<ReturnType<typeof table>>, index: number) {
  return wrapper.findAllComponents({ name: 'UserActionsMenu' })[index].vm
}

test('confirms an action before running it', async () => {
  admin.unbanUser.mockResolvedValue({
    data: { user: { ...users[1], banned: false } },
    error: null,
  })
  const wrapper = await table()
  menu(wrapper, 1).$emit('action', 'unban')
  await flushPromises()
  expect(document.body.textContent).toContain('Sperre aufheben')
  expect(admin.unbanUser).not.toHaveBeenCalled()
  const confirm = [...document.body.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Entsperren',
  )
  confirm?.click()
  await flushPromises()
  expect(admin.unbanUser).toHaveBeenCalledWith({ userId: 'u2' })
  expect(wrapper.text()).toContain('Die Sperre von Max wurde aufgehoben.')
  expect(wrapper.findAll('tr[data-user-id]')[1].text()).toContain('Aktiv')
  expect(admin.listUsers).toHaveBeenCalledTimes(1)
})

test('reports created users and set passwords', async () => {
  const wrapper = await table()
  wrapper.getComponent({ name: 'CreateUserDialog' }).vm.$emit('saved', {
    ...users[1],
    id: 'u3',
    email: 'neu@example.com',
  })
  await flushPromises()
  expect(wrapper.text()).toContain('Benutzer neu@example.com wurde angelegt.')
  expect(wrapper.findAll('tr[data-user-id]')).toHaveLength(3)
  expect(admin.listUsers).toHaveBeenCalledTimes(1)
  menu(wrapper, 1).$emit('password')
  await flushPromises()
  expect(
    wrapper.getComponent({ name: 'SetPasswordDialog' }).props('user'),
  ).toEqual(users[1])
  wrapper.getComponent({ name: 'SetPasswordDialog' }).vm.$emit('saved')
  await flushPromises()
  expect(wrapper.text()).toContain('Das Passwort von Max wurde gesetzt.')
})
