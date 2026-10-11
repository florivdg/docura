import { expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CreateUserDialog from './CreateUserDialog.vue'
import SetPasswordDialog from './SetPasswordDialog.vue'

const admin = vi.hoisted(() => ({
  createUser: vi.fn(),
  setUserPassword: vi.fn(),
}))
vi.mock('@/lib/auth-client', () => ({ authClient: { admin } }))

const PASSWORD = 'ein-sehr-langes-passwort'

function input(id: string) {
  return document.getElementById(id) as HTMLInputElement
}

async function type(id: string, value: string) {
  input(id).value = value
  input(id).dispatchEvent(new Event('input'))
  await flushPromises()
}

async function submit() {
  document.querySelector('form')!.dispatchEvent(new Event('submit'))
  await flushPromises()
}

function openCreate() {
  return mount(CreateUserDialog, {
    props: { open: true },
    attachTo: document.body,
  })
}

function openSetPassword() {
  return mount(SetPasswordDialog, {
    props: { open: true, user: { id: 'u2', name: 'Max' } },
    attachTo: document.body,
  })
}

test('creates a user with the chosen data', async () => {
  admin.createUser.mockResolvedValueOnce({
    error: { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' },
  })
  const wrapper = openCreate()
  await flushPromises()
  await type('user-name', ' Max ')
  await type('user-email', 'max@example.com')
  await type('user-password', PASSWORD)
  await type('user-confirmation', PASSWORD)
  await submit()
  expect(admin.createUser).toHaveBeenCalledWith({
    name: 'Max',
    email: 'max@example.com',
    password: PASSWORD,
    role: 'user',
  })
  expect(document.body.textContent).toContain('existiert bereits')
  const created = { id: 'u2', name: 'Max', email: 'max@example.com' }
  admin.createUser.mockResolvedValueOnce({
    data: { user: created },
    error: null,
  })
  await submit()
  expect(wrapper.emitted('saved')).toEqual([[created]])
})

test('does not submit an incomplete user', async () => {
  openCreate()
  await flushPromises()
  await type('user-password', 'kurz')
  await submit()
  expect(admin.createUser).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('mindestens 16 Zeichen')
})

test('sets the password of that user', async () => {
  admin.setUserPassword.mockResolvedValue({ error: null })
  const wrapper = openSetPassword()
  await flushPromises()
  await type('set-password', PASSWORD)
  await type('set-confirmation', PASSWORD)
  await submit()
  expect(admin.setUserPassword).toHaveBeenCalledWith({
    userId: 'u2',
    newPassword: PASSWORD,
  })
  expect(wrapper.emitted('saved')).toHaveLength(1)
})

test('shows a German error when setting the password fails', async () => {
  admin.setUserPassword.mockResolvedValue({
    error: { code: 'PASSWORD_TOO_SHORT' },
  })
  const wrapper = openSetPassword()
  await flushPromises()
  await type('set-password', PASSWORD)
  await type('set-confirmation', PASSWORD)
  await submit()
  expect(wrapper.emitted('saved')).toBeUndefined()
  expect(document.body.textContent).toContain('mindestens 16 Zeichen')
})
