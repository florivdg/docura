import { isValidUUID } from './api-utils'
import { ApiValidationError } from './api-validation-error'

/** The parsed JSON body as a plain object; arrays and primitives are rejected. */
export function requireJsonObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiValidationError('Ungültiger JSON-Body')
  return body as Record<string, unknown>
}

/**
 * A UUID string in canonical lowercase, or a 400 with `message`. Postgres
 * compares uuids case-insensitively, so callers comparing ids in JS (overlap,
 * de-duplication) need the canonical form.
 */
export function uuid(value: unknown, message: string): string {
  if (typeof value !== 'string' || !isValidUUID(value))
    throw new ApiValidationError(message)
  return value.toLowerCase()
}

interface UuidListOptions {
  /** For a non-array, and for an empty array unless `allowEmpty` is set. */
  emptyMessage: string
  invalidMessage: string
  allowEmpty?: boolean
  /** Upper bound; `label` names the items in the German error message. */
  max?: { count: number; label: string }
}

/** A de-duplicated list of UUIDs; every entry must be a valid UUID string. */
export function uuidList(
  value: unknown,
  { emptyMessage, invalidMessage, allowEmpty = false, max }: UuidListOptions,
): string[] {
  if (!Array.isArray(value) || (!allowEmpty && !value.length))
    throw new ApiValidationError(emptyMessage)
  if (max && value.length > max.count)
    throw new ApiValidationError(
      `Zu viele ${max.label} ausgewählt (maximal ${max.count})`,
    )
  return [...new Set(value.map((id) => uuid(id, invalidMessage)))]
}
