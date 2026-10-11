import { afterEach, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ResetPasswordForm from './ResetPasswordForm.vue'

const authClient = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}))
vi.mock('@/lib/auth-client', () => ({ authClient }))

const PASSWORD = 'ein-sehr-langes-passwort'
afterEach(() => window.history.replaceState(null, '', '/'))

async function page(search = '') {
  window.history.replaceState(null, '', `/reset-password${search}`)
  const wrapper = mount(ResetPasswordForm)
  await flushPromises()
  return wrapper
}

test('requests a reset link without revealing whether the account exists', async () => {
  authClient.requestPasswordReset.mockResolvedValue({ error: null })
  const wrapper = await page()
  await wrapper.find('#email').setValue('max@example.com')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(authClient.requestPasswordReset).toHaveBeenCalledWith({
    email: 'max@example.com',
    redirectTo: '/reset-password',
  })
  expect(wrapper.text()).toContain(
    'Falls ein Konto mit dieser E-Mail existiert',
  )
})

test('explains invalid or failed reset links', async () => {
  expect((await page('?error=INVALID_TOKEN')).text()).toContain(
    'ungültig oder abgelaufen',
  )
  expect((await page('?error=OTHER')).text()).toContain(
    'Ein Fehler ist aufgetreten',
  )
})

test('validates and saves the new password', async () => {
  authClient.resetPassword.mockResolvedValue({ error: null })
  const wrapper = await page('?token=abc')
  await wrapper.find('#reset-password').setValue('kurz')
  expect(wrapper.find('button[type=submit]').attributes()).toHaveProperty(
    'disabled',
  )
  await wrapper.find('form').trigger('submit')
  expect(authClient.resetPassword).not.toHaveBeenCalled()
  await wrapper.find('#reset-password').setValue(PASSWORD)
  await wrapper.find('#reset-confirmation').setValue(PASSWORD)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(authClient.resetPassword).toHaveBeenCalledWith({
    newPassword: PASSWORD,
    token: 'abc',
  })
  expect(wrapper.text()).toContain('erfolgreich geändert')
})
