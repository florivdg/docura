import { ApiValidationError } from './api-validation-error'
import { requireJsonObject, uuid, uuidList } from './request-validation'
const MAX_IDS = 100
const ACTIONS = [
  'move',
  'addTags',
  'trash',
  'restore',
  'favorite',
  'unfavorite',
  'reprocess',
] as const
export type BulkAction = (typeof ACTIONS)[number]
export interface BulkDocumentRequest {
  ids: string[]
  action: BulkAction
  folderId: string | null
  tagIds: string[]
}

function folderId(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : uuid(value, 'Ungültige Ordner-ID')
}

export function validateBulkDocumentRequest(
  body: unknown,
): BulkDocumentRequest {
  const value = requireJsonObject(body)
  const ids = uuidList(value.ids, {
    emptyMessage: 'ids muss ein nicht-leeres Array sein',
    invalidMessage: 'Ungültige Dokument-ID',
    max: { count: MAX_IDS, label: 'Dokumente' },
  })
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
    tagIds:
      action === 'addTags'
        ? uuidList(value.tagIds, {
            emptyMessage: 'tagIds muss ein nicht-leeres Array sein',
            invalidMessage: 'Ungültige Tag-ID',
          })
        : [],
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
    case 'favorite':
    case 'unfavorite':
      return { isFavorite: request.action === 'favorite' }
    default:
      // addTags and reprocess write other tables, not document columns.
      return {}
  }
}
