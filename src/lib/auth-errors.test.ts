import { expect, test } from 'vitest'
import { authErrorMessage, authRequestError } from './auth-errors'

test('maps known Better Auth codes to German messages', () => {
  expect(
    authErrorMessage({ code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' }, 'x'),
  ).toContain('existiert bereits')
  expect(authErrorMessage({ code: 'INVALID_PASSWORD' }, 'x')).toBe(
    'Das aktuelle Passwort ist falsch.',
  )
  expect(
    authErrorMessage({ code: 'YOU_ARE_NOT_ALLOWED_TO_LIST_USERS' }, 'x'),
  ).toContain('Berechtigung')
})

test('maps sign-in, guard and reset codes and falls back otherwise', () => {
  expect(authErrorMessage({ code: 'BANNED_USER' }, 'x')).toBe(
    'Ihr Konto wurde gesperrt.',
  )
  expect(
    authErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD' }, 'x'),
  ).toContain('Passwort ist falsch')
  expect(
    authErrorMessage({ code: 'YOU_CANNOT_CHANGE_YOUR_OWN_ROLE' }, 'x'),
  ).toBe('Sie können Ihre eigene Rolle nicht ändern.')
  expect(authErrorMessage({ code: 'RESET_PASSWORD_DISABLED' }, 'x')).toContain(
    'nicht verfügbar',
  )
  expect(
    authErrorMessage({ code: 'OTHER', message: 'English' }, 'Fehler'),
  ).toBe('Fehler')
  expect(authErrorMessage(null, 'Fehler')).toBe('Fehler')
})

test('turns client requests into an error message or an empty string', async () => {
  expect(await authRequestError(async () => ({ error: null }), 'Fehler')).toBe(
    '',
  )
  expect(
    await authRequestError(
      async () => ({ error: { code: 'INVALID_PASSWORD' } }),
      'Fehler',
    ),
  ).toBe('Das aktuelle Passwort ist falsch.')
  expect(
    await authRequestError(
      () => Promise.reject(new Error('offline')),
      'Fehler',
    ),
  ).toBe('Fehler')
})
