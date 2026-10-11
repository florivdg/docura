import { ApiValidationError } from './api-validation-error'
import { requireJsonObject, uuid, uuidList } from './request-validation'

const MAX_NAME_LENGTH = 120
const MAX_MERGE_SOURCES = 100
const INVALID_ID = 'Ungültige Korrespondenten-ID'

export interface CorrespondentMergeRequest {
  targetId: string
  sourceIds: string[]
}

/** Trimmed `name` of a create/rename body; 1 to 120 characters. */
export function correspondentName(body: unknown): string {
  const { name } = requireJsonObject(body)
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed.length < 1 || trimmed.length > MAX_NAME_LENGTH)
    throw new ApiValidationError(
      `Name muss ein nicht-leerer Text sein (maximal ${MAX_NAME_LENGTH} Zeichen)`,
    )
  return trimmed
}

export function correspondentId(value: unknown): string {
  return uuid(value, INVALID_ID)
}

/** Validates `{ targetId, sourceIds }`; source ids are de-duplicated. */
export function correspondentMergeRequest(
  body: unknown,
): CorrespondentMergeRequest {
  const value = requireJsonObject(body)
  const targetId = correspondentId(value.targetId)
  const sourceIds = uuidList(value.sourceIds, {
    emptyMessage:
      'Mindestens ein Korrespondent zum Zusammenführen ist erforderlich',
    invalidMessage: INVALID_ID,
    max: { count: MAX_MERGE_SOURCES, label: 'Korrespondenten' },
  })
  if (sourceIds.includes(targetId))
    throw new ApiValidationError(
      'Der Ziel-Korrespondent darf nicht unter den zusammenzuführenden sein',
    )
  return { targetId, sourceIds }
}
