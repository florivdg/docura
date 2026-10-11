import {
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
} from '@/lib/password-policy'

/** German messages for Better Auth error codes surfaced in the UI. */
const AUTH_ERROR_MESSAGES: Partial<Record<string, string>> = {
  INVALID_EMAIL: 'Die E-Mail-Adresse ist ungültig.',
  INVALID_EMAIL_OR_PASSWORD: 'E-Mail-Adresse oder Passwort ist falsch.',
  INVALID_PASSWORD: 'Das aktuelle Passwort ist falsch.',
  BANNED_USER: 'Ihr Konto wurde gesperrt.',
  AUTH_CANCELLED: 'Die Passkey-Anmeldung wurde abgebrochen.',
  PASSKEY_NOT_FOUND: 'Dieser Passkey ist nicht registriert.',
  PASSWORD_TOO_SHORT: PASSWORD_TOO_SHORT_MESSAGE,
  PASSWORD_TOO_LONG: PASSWORD_TOO_LONG_MESSAGE,
  CREDENTIAL_ACCOUNT_NOT_FOUND:
    'Für dieses Konto ist noch kein Passwort hinterlegt.',
  INVALID_TOKEN:
    'Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Link an.',
  RESET_PASSWORD_DISABLED:
    'Das Zurücksetzen per E-Mail ist nicht verfügbar. Bitte wenden Sie sich an einen Administrator.',
  USER_NOT_FOUND: 'Der Benutzer wurde nicht gefunden.',
  YOU_CANNOT_BAN_YOURSELF: 'Sie können sich nicht selbst sperren.',
  YOU_CANNOT_REMOVE_YOURSELF: 'Sie können sich nicht selbst entfernen.',
  YOU_CANNOT_CHANGE_YOUR_OWN_ROLE: 'Sie können Ihre eigene Rolle nicht ändern.',
}

/** Families of codes that share one message, e.g. USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL. */
const AUTH_ERROR_PREFIXES: [prefix: string, message: string][] = [
  [
    'USER_ALREADY_EXISTS',
    'Ein Benutzer mit dieser E-Mail-Adresse existiert bereits.',
  ],
  ['YOU_ARE_NOT_ALLOWED', 'Dazu fehlt Ihnen die Berechtigung.'],
]

interface AuthErrorLike {
  code?: string
  message?: string
}

/** Maps a Better Auth client error to a German message, or the caller's fallback for unknown codes. */
export function authErrorMessage(
  error: AuthErrorLike | null | undefined,
  fallback: string,
): string {
  const code = error?.code ?? ''
  const prefixed = AUTH_ERROR_PREFIXES.find(([prefix]) =>
    code.startsWith(prefix),
  )
  return AUTH_ERROR_MESSAGES[code] ?? prefixed?.[1] ?? fallback
}

/**
 * Runs a Better Auth client request and returns a German error message, or an
 * empty string on success. Network failures map to the fallback.
 */
export async function authRequestError(
  request: () => Promise<{ error: AuthErrorLike | null }>,
  fallback: string,
): Promise<string> {
  try {
    const { error } = await request()
    return error ? authErrorMessage(error, fallback) : ''
  } catch {
    return fallback
  }
}
