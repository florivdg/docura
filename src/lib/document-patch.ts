import { ApiValidationError } from './api-validation-error'
import { isValidIsoDate } from './api-utils'
import { requireJsonObject, uuid, uuidList } from './request-validation'

export interface DocumentPatch {
  folderId?: string | null
  correspondentId?: string | null
  documentDate?: string | null
  tagIds?: string[]
  name?: string
  isFavorite?: boolean
  trashedAt?: string | null
  archivedAt?: string | null
}

type ReferenceLookup = (
  kind: 'folder' | 'correspondent',
  id: string,
) => Promise<boolean>
type TagCount = (ids: string[]) => Promise<number>

async function validateReference(
  value: unknown,
  kind: 'folder' | 'correspondent',
  exists: ReferenceLookup,
): Promise<void> {
  if (value === null || value === undefined) return
  const label = kind === 'folder' ? 'Ordner' : 'Korrespondenten'
  if (!(await exists(kind, uuid(value, `Ungültige ${label}-ID`))))
    throw new ApiValidationError(
      kind === 'folder'
        ? 'Ordner nicht gefunden'
        : 'Korrespondent nicht gefunden',
      404,
    )
}

function validateDate(value: unknown): void {
  if (value === null || value === undefined) return
  if (typeof value !== 'string' || !isValidIsoDate(value))
    throw new ApiValidationError('Ungültiges Belegdatum')
}

function validateName(value: unknown): void {
  if (typeof value !== 'string')
    throw new ApiValidationError(
      'Name muss ein nicht-leerer Text sein (maximal 200 Zeichen)',
    )
  if (value.trim().length < 1 || value.trim().length > 200)
    throw new ApiValidationError(
      'Name muss ein nicht-leerer Text sein (maximal 200 Zeichen)',
    )
}

async function validateTags(
  value: unknown,
  countTags: TagCount,
): Promise<void> {
  const ids = uuidList(value, {
    emptyMessage: 'tagIds muss ein Array sein',
    invalidMessage: 'Ungültige Tag-ID',
    allowEmpty: true,
  })
  // Compared with the raw length: duplicate ids are reported as missing tags.
  if (ids.length && (await countTags(ids)) !== (value as string[]).length)
    throw new ApiValidationError('Ein oder mehrere Tags nicht gefunden', 404)
}

export async function validateDocumentPatch(
  body: unknown,
  exists: ReferenceLookup,
  countTags: TagCount,
): Promise<DocumentPatch> {
  const patch = requireJsonObject(body) as DocumentPatch
  if ('folderId' in patch)
    await validateReference(patch.folderId, 'folder', exists)
  if ('correspondentId' in patch)
    await validateReference(patch.correspondentId, 'correspondent', exists)
  if ('documentDate' in patch) validateDate(patch.documentDate)
  if ('name' in patch) validateName(patch.name)
  if ('tagIds' in patch) await validateTags(patch.tagIds, countTags)
  if ('isFavorite' in patch && typeof patch.isFavorite !== 'boolean')
    throw new ApiValidationError('isFavorite muss ein Boolean sein')
  return patch
}

export function documentPatchUpdates(
  body: DocumentPatch,
  now = new Date(),
): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  if ('name' in body) updates.name = body.name!.trim()
  for (const field of [
    'folderId',
    'correspondentId',
    'documentDate',
  ] as const) {
    if (field in body) updates[field] = body[field] ?? null
  }
  if ('isFavorite' in body) updates.isFavorite = body.isFavorite
  for (const field of ['trashedAt', 'archivedAt'] as const) {
    if (field in body) updates[field] = body[field] === null ? null : now
  }
  return updates
}
