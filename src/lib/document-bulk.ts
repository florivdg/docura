import { isValidUUID } from './api-utils'
import { ApiValidationError } from './api-validation-error'
const MAX_IDS = 100
const ACTIONS = [
  'move',
  'addTags',
  'trash',
  'restore',
  'favorite',
  'unfavorite',
] as const
export type BulkAction = (typeof ACTIONS)[number]
export interface BulkDocumentRequest {
  ids: string[]
  action: BulkAction
  folderId: string | null
  tagIds: string[]
}

function documentIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length)
    throw new ApiValidationError('ids muss ein nicht-leeres Array sein')
  if (value.length > MAX_IDS)
    throw new ApiValidationError(
      `Zu viele Dokumente ausgewählt (maximal ${MAX_IDS})`,
    )
  if (value.some((id) => typeof id !== 'string' || !isValidUUID(id)))
    throw new ApiValidationError('Ungültige Dokument-ID')
  return [...new Set(value as string[])]
}
function folderId(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !isValidUUID(value))
    throw new ApiValidationError('Ungültige Ordner-ID')
  return value
}
function tagIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length)
    throw new ApiValidationError('tagIds muss ein nicht-leeres Array sein')
  if (value.some((id) => typeof id !== 'string' || !isValidUUID(id)))
    throw new ApiValidationError('Ungültige Tag-ID')
  return [...new Set(value as string[])]
}
export function validateBulkDocumentRequest(
  body: unknown,
): BulkDocumentRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiValidationError('Ungültiger JSON-Body')
  const value = body as Record<string, unknown>
  const ids = documentIds(value.ids)
  if (
    typeof value.action !== 'string' ||
    !ACTIONS.includes(value.action as BulkAction)
  )
    throw new ApiValidationError('Ungültige Aktion')
  const action = value.action as BulkAction
  return {
    ids,
    action,
    folderId: action === 'move' ? folderId(value.folderId) : null,
    tagIds: action === 'addTags' ? tagIds(value.tagIds) : [],
  }
}

export function bulkDocumentUpdates(
  request: BulkDocumentRequest,
  now = new Date(),
): Record<string, unknown> {
  switch (request.action) {
    case 'move':
      return { folderId: request.folderId }
    case 'trash':
      return { trashedAt: now }
    case 'restore':
      return { trashedAt: null }
    default:
      return { isFavorite: request.action === 'favorite' }
  }
}
