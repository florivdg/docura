import { expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ChangePasswordForm from './ChangePasswordForm.vue'

const changePassword = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth-client', () => ({ authClient: { changePassword } }))

const NEW_PASSWORD = 'ein-sehr-langes-passwort'

async function fill(current: string, next: string, confirm: string) {
  const wrapper = mount(ChangePasswordForm)
  await wrapper.find('#current-password').setValue(current)
  await wrapper.find('#new-password').setValue(next)
  await wrapper.find('#new-confirmation').setValue(confirm)
  return wrapper
}

test('validates length and confirmation before submitting', async () => {
  const short = await fill('alt', 'kurz', '')
  expect(short.text()).toContain('Das Passwort muss mindestens 16 Zeichen')
  expect(short.find('button[type=submit]').attributes()).toHaveProperty(
    'disabled',
  )
  const mismatch = await fill('alt', NEW_PASSWORD, `${NEW_PASSWORD}x`)
  expect(mismatch.text()).toContain('stimmen nicht überein')
  await mismatch.find('form').trigger('submit')
  expect(changePassword).not.toHaveBeenCalled()
})

test('changes the password and revokes other sessions', async () => {
  changePassword.mockResolvedValue({ error: null })
  const wrapper = await fill('altes-passwort', NEW_PASSWORD, NEW_PASSWORD)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(changePassword).toHaveBeenCalledWith({
    currentPassword: 'altes-passwort',
    newPassword: NEW_PASSWORD,
    revokeOtherSessions: true,
  })
  expect(wrapper.text()).toContain('Passwort wurde geändert')
  expect(
    (wrapper.find('#new-password').element as HTMLInputElement).value,
  ).toBe('')
})

test('shows German errors for rejected and failed requests', async () => {
  changePassword.mockResolvedValueOnce({
    error: { code: 'INVALID_PASSWORD', message: 'Invalid password' },
  })
  const wrapper = await fill('falsch', NEW_PASSWORD, NEW_PASSWORD)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('Das aktuelle Passwort ist falsch.')
  changePassword.mockRejectedValueOnce(new Error('offline'))
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('Passwort konnte nicht geändert werden.')
})
