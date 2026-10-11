const PUBLIC_PAGES = new Set(['/login', '/reset-password', '/api/health'])
const AUTH_API_PREFIX = '/api/auth'

/**
 * Paths served without a session: the login pages, the health check for
 * container orchestration and Better Auth's own endpoints.
 */
export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PAGES.has(pathname) ||
    pathname === AUTH_API_PREFIX ||
    pathname.startsWith(`${AUTH_API_PREFIX}/`)
  )
}
