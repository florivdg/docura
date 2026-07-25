import { resolve } from 'node:path'

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidUUID(id: string): boolean {
  return UUID_V4_RE.test(id)
}

export function safePath(uploadDir: string, storagePath: string): string {
  const resolvedBase = resolve(uploadDir)
  const resolvedPath = resolve(uploadDir, storagePath)
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Ungültiger Dateipfad')
  }
  return resolvedPath
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Checks for an ISO date string (YYYY-MM-DD) that is a real calendar date. */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

export function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new JsonParseError()
  }
}

export class JsonParseError extends Error {
  constructor() {
    super('Ungültiger JSON-Body')
    this.name = 'JsonParseError'
  }
}

export const VALID_STATUSES = new Set([
  'pending',
  'processing',
  'completed',
  'failed',
])
