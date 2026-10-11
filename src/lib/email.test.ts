import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const sendMail = vi.hoisted(() => vi.fn())
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail }) },
}))

const { isSmtpConfigured, sendPasswordResetEmail } = await import('./email')

const user = { email: 'max@example.com', name: 'Max <Muster>' }

beforeEach(() => {
  sendMail.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllEnvs())

test('detects whether SMTP is configured', () => {
  vi.stubEnv('SMTP_HOST', '  ')
  expect(isSmtpConfigured()).toBe(false)
  vi.stubEnv('SMTP_HOST', 'mail.example.com')
  expect(isSmtpConfigured()).toBe(true)
})

test('sends an escaped reset mail and swallows transport errors', async () => {
  vi.stubEnv('SMTP_HOST', 'mail.example.com')
  await sendPasswordResetEmail(user, 'https://docura.test/reset?a=1&b=2')
  const mail = sendMail.mock.calls[0][0]
  expect(mail.to).toBe('max@example.com')
  expect(mail.html).toContain('Hallo Max &lt;Muster&gt;')
  expect(mail.html).toContain('https://docura.test/reset?a=1&amp;b=2')
  expect(mail.html).not.toContain('{{')
  sendMail.mockRejectedValueOnce(new Error('offline'))
  await expect(
    sendPasswordResetEmail(user, 'https://docura.test/reset'),
  ).resolves.toBeUndefined()
  expect(console.error).toHaveBeenCalled()
})
