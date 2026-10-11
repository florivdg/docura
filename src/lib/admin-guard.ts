import { APIError } from 'better-auth/api'

/**
 * Checks for the Better Auth admin endpoints that the admin plugin does not
 * perform itself. The plugin already rejects banning or removing yourself
 * (including `update-user` with `banned: true`), but not changing your own
 * role, and it does not apply the password policy to `create-user`.
 */

interface PasswordLengthConfig {
  minPasswordLength: number
  maxPasswordLength: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * The `userId` exactly as the admin plugin parses it (`z.coerce.string()`), so
 * guards see the same id as the endpoint, e.g. `["abc"]` becomes `"abc"`.
 */
export function coercedUserId(body: unknown): string | null {
  if (!isRecord(body) || body.userId === undefined || body.userId === null) {
    return null
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- mirrors z.coerce.string(), which uses String() as well.
  return String(body.userId)
}

/** The user whose role the request changes, so the caller only looks up the session when needed. */
export function roleChangeTarget(path: string, body: unknown): string | null {
  const userId = coercedUserId(body)
  if (!isRecord(body) || userId === null) return null
  if (path === '/admin/set-role') return userId
  const changesRole =
    path === '/admin/update-user' && isRecord(body.data) && 'role' in body.data
  return changesRole ? userId : null
}

export function ownRoleChangeError() {
  return new APIError('FORBIDDEN', {
    code: 'YOU_CANNOT_CHANGE_YOUR_OWN_ROLE',
    message: 'You cannot change your own role',
  })
}

/** Rejects `create-user` passwords outside the configured length limits with Better Auth's own codes. */
export function createUserPasswordError(
  path: string,
  body: unknown,
  { minPasswordLength, maxPasswordLength }: PasswordLengthConfig,
): APIError | null {
  if (path !== '/admin/create-user' || !isRecord(body)) return null
  const { password } = body
  if (typeof password !== 'string') return null
  if (password.length < minPasswordLength) {
    return new APIError('BAD_REQUEST', {
      code: 'PASSWORD_TOO_SHORT',
      message: 'Password too short',
    })
  }
  if (password.length > maxPasswordLength) {
    return new APIError('BAD_REQUEST', {
      code: 'PASSWORD_TOO_LONG',
      message: 'Password too long',
    })
  }
  return null
}
