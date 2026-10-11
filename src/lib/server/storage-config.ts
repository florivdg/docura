const DEFAULT_ORPHAN_MIN_AGE_MINUTES = 60
const DEFAULT_EXPORT_MAX_DOCUMENTS = 10_000
const DEFAULT_TRASH_RETENTION_DAYS = 90

/**
 * A positive number from the environment that is at least `min`, or
 * `fallback` when it is missing, not a number or too small.
 */
export function positiveNumber(
  raw: string | undefined,
  fallback: number,
  min = 0,
): number {
  const value = Number(raw)
  return raw && Number.isFinite(value) && value > 0 && value >= min
    ? value
    : fallback
}

/** Storage settings shared by the web app, the worker and the CLI scripts. */
export const STORAGE_CONFIG = {
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  // Orphans younger than this may be uploads in flight and are never deleted.
  orphanMinAgeMs:
    positiveNumber(
      process.env.STORAGE_ORPHAN_MIN_AGE_MINUTES,
      DEFAULT_ORPHAN_MIN_AGE_MINUTES,
    ) * 60_000,
  exportMaxDocuments: Math.floor(
    positiveNumber(
      process.env.EXPORT_MAX_DOCUMENTS,
      DEFAULT_EXPORT_MAX_DOCUMENTS,
    ),
  ),
  trashRetentionDays: positiveNumber(
    process.env.TRASH_RETENTION_DAYS,
    DEFAULT_TRASH_RETENTION_DAYS,
  ),
} as const
