/** Shared by the Better Auth config, the user CLI scripts and every password form. */
export const MIN_PASSWORD_LENGTH = 16
export const MAX_PASSWORD_LENGTH = 128

export const PASSWORD_TOO_SHORT_MESSAGE = `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`
export const PASSWORD_TOO_LONG_MESSAGE = `Das Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen lang sein.`

/** Returns a German validation message, or an empty string when the password is acceptable. */
export function passwordValidationError(
  password: string,
  confirmation: string = password,
): string {
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE
  if (password.length > MAX_PASSWORD_LENGTH) return PASSWORD_TOO_LONG_MESSAGE
  if (password !== confirmation) {
    return 'Die Passwörter stimmen nicht überein.'
  }
  return ''
}
