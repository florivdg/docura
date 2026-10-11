// Checked before anything imports '@/db': bun:sql throws a bare
// "Invalid URL" while the module is loaded, which tells an operator nothing.
// Must stay free of database imports for that reason.

const INVALID_URL =
  'DATABASE_URL ist ungültig. Enthält POSTGRES_PASSWORD Sonderzeichen? Erlaubt sind nur Buchstaben und Ziffern.'

/**
 * Whether `url` keeps its user and password intact: it parses, its
 * percent-escapes decode, and the parser did not have to escape anything in
 * the user info (a raw `@` or `:` would be split differently by tools that
 * read the URL as text, e.g. scripts/backup-common.sh).
 */
function hasIntactCredentials(url: string): boolean {
  try {
    const { username, password } = new URL(url)
    decodeURIComponent(username)
    decodeURIComponent(password)
    if (!username && !password) return true
    return (
      url.includes(`//${username}:${password}@`) ||
      (!password && url.includes(`//${username}@`))
    )
  } catch {
    return false
  }
}

/**
 * A German message when DATABASE_URL is missing or malformed, else null.
 * Valid percent-encoded URLs (local development) pass.
 */
export function databaseUrlProblem(url: string | undefined): string | null {
  if (!url) return 'DATABASE_URL ist nicht gesetzt.'
  return hasIntactCredentials(url) ? null : INVALID_URL
}
