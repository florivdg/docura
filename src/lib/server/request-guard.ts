import { jsonResponse } from '@/lib/json-response'

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

/** Whether `origin` is the configured app origin (both must be valid URLs). */
function isAllowedOrigin(
  origin: string | null,
  allowedOrigin: string | undefined,
): boolean {
  if (!origin || !allowedOrigin) return false
  try {
    return new URL(origin).origin === new URL(allowedOrigin).origin
  } catch {
    return false
  }
}

/** A request without session: 401 for the API, the login page otherwise. */
export function unauthenticatedResponse(
  pathname: string,
  redirectToLogin: () => Response,
): Response {
  return isApiPath(pathname)
    ? jsonResponse({ error: 'Nicht authentifiziert' }, 401)
    : redirectToLogin()
}

/**
 * CSRF protection: a mutating API request must carry the app's `Origin`
 * (`BETTER_AUTH_URL`). Returns the 403 response, or null when allowed.
 */
export function originRejection(
  request: Request,
  pathname: string,
  allowedOrigin: string | undefined,
): Response | null {
  if (!isApiPath(pathname) || !MUTATING_METHODS.has(request.method)) return null
  return isAllowedOrigin(request.headers.get('Origin'), allowedOrigin)
    ? null
    : jsonResponse({ error: 'Ungültiger Origin' }, 403)
}
