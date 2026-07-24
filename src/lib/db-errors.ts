/** Postgres SQLSTATE code for `unique_violation`. */
const UNIQUE_VIOLATION_SQLSTATE = '23505'

const MAX_CAUSE_DEPTH = 5

type PgErrorLike = {
  code?: unknown
  errno?: unknown
  cause?: unknown
}

/**
 * Detects Postgres unique-constraint violations.
 *
 * bun:sql surfaces the SQLSTATE in `errno` (its `code` holds a Bun-specific
 * string like ERR_POSTGRES_SERVER_ERROR), and drizzle wraps the driver error,
 * so both fields are checked along the whole `cause` chain.
 */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (typeof current !== 'object' || current === null) break
    const candidate = current as PgErrorLike

    if (
      candidate.code === UNIQUE_VIOLATION_SQLSTATE ||
      candidate.errno === UNIQUE_VIOLATION_SQLSTATE
    ) {
      return true
    }

    current = candidate.cause
  }

  return false
}
