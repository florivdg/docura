import { expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import LoginForm from './LoginForm.vue'

const authClient = vi.hoisted(() => ({
  signIn: {
    email: vi.fn(),
    passkey: vi.fn(async () => ({
      error: { code: 'AUTH_CANCELLED', message: 'Auth cancelled' },
    })),
  },
}))
vi.mock('@/lib/auth-client', () => ({ authClient }))

function form(passwordResetEnabled?: boolean) {
  return mount(LoginForm, { props: { passwordResetEnabled } })
}

test('only offers password reset when SMTP is configured', () => {
  expect(form(true).find('a[href="/reset-password"]').exists()).toBe(true)
  expect(form(false).find('a[href="/reset-password"]').exists()).toBe(false)
  expect(form().text()).not.toContain('Passwort vergessen?')
})

test('shows sign-in errors in German', async () => {
  authClient.signIn.email.mockResolvedValueOnce({
    error: { code: 'BANNED_USER', message: 'You have been banned' },
  })
  const wrapper = form(false)
  await wrapper.find('#email').setValue('max@example.com')
  await wrapper.find('#password').setValue('falsch')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  expect(authClient.signIn.email).toHaveBeenCalledWith({
    email: 'max@example.com',
    password: 'falsch',
  })
  expect(wrapper.text()).toContain('Ihr Konto wurde gesperrt.')
})

test('maps cancelled passkey sign-ins to a German message', async () => {
  const wrapper = form()
  await wrapper.find('button[type=button]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Die Passkey-Anmeldung wurde abgebrochen.')
})
