/**
 * Audit trail of document changes: shared types and the pure snapshot diff.
 * Browser code imports from here; the database side lives in `src/db/activity.ts`.
 */

export const ACTIVITY_ACTIONS = [
  'uploaded',
  'updated',
  'archived',
  'unarchived',
  'trashed',
  'restored',
  'deleted',
  'reprocess_requested',
] as const
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number]

export const ACTOR_TYPES = ['user', 'system'] as const
export type ActorType = (typeof ACTOR_TYPES)[number]

/** Who caused an activity; `name` is snapshotted so removed users stay readable. */
export interface ActivityActor {
  type: ActorType
  id: string | null
  name: string
}

export interface NamedRef {
  id: string
  name: string
}

export interface FieldChange<V> {
  from: V
  to: V
}

/** Only the fields that actually changed; names are snapshotted. */
export interface ActivityChanges {
  name?: FieldChange<string>
  folder?: FieldChange<NamedRef | null>
  correspondent?: FieldChange<NamedRef | null>
  documentDate?: FieldChange<string | null>
  tags?: FieldChange<NamedRef[]>
  isFavorite?: FieldChange<boolean>
}
export type ActivityField = keyof ActivityChanges

/** One row of a document's history (`GET /api/documents/[id]/activity`). */
export interface ActivityEntry {
  id: string
  documentId: string | null
  documentName: string
  actorType: ActorType
  actorId: string | null
  actorName: string
  action: ActivityAction
  changes: ActivityChanges | null
  batchId: string
  createdAt: string
}

/** One request or worker call on the dashboard (`GET /api/activity`). */
export interface ActivityGroup {
  batchId: string
  action: ActivityAction
  actorType: ActorType
  actorId: string | null
  actorName: string
  createdAt: string
  count: number
  /** The first document of the batch; `id` is null once it was deleted. */
  document: { id: string | null; name: string }
  /** Changes of that first document. */
  changes: ActivityChanges | null
}

/** The audited state of one document at a point in time. */
export interface DocumentSnapshot {
  id: string
  name: string
  folder: NamedRef | null
  correspondent: NamedRef | null
  documentDate: string | null
  tags: NamedRef[]
  isFavorite: boolean
  archivedAt: Date | string | null
  trashedAt: Date | string | null
}

/** An activity derived from two snapshots, before actor and batch are known. */
export interface SnapshotActivity {
  documentId: string
  documentName: string
  action: ActivityAction
  changes: ActivityChanges | null
}

const refId = (value: NamedRef | null) => value?.id ?? null

const tagKey = (tags: NamedRef[]) =>
  tags
    .map((tag) => tag.id)
    .sort()
    .join(',')

/** Field → whether it differs between two snapshots. */
const FIELD_DIFFERS: {
  [F in ActivityField]: (a: DocumentSnapshot, b: DocumentSnapshot) => boolean
} = {
  name: (a, b) => a.name !== b.name,
  folder: (a, b) => refId(a.folder) !== refId(b.folder),
  correspondent: (a, b) => refId(a.correspondent) !== refId(b.correspondent),
  documentDate: (a, b) => a.documentDate !== b.documentDate,
  tags: (a, b) => tagKey(a.tags) !== tagKey(b.tags),
  isFavorite: (a, b) => a.isFavorite !== b.isFavorite,
}

/** The metadata fields that changed, with their old and new values. */
export function diffSnapshots(
  before: DocumentSnapshot,
  after: DocumentSnapshot,
): ActivityChanges {
  const changes: Record<string, FieldChange<unknown>> = {}
  for (const field of Object.keys(FIELD_DIFFERS) as ActivityField[]) {
    if (FIELD_DIFFERS[field](before, after))
      changes[field] = { from: before[field], to: after[field] }
  }
  return changes as ActivityChanges
}

function flip(
  before: unknown,
  after: unknown,
  [set, cleared]: [ActivityAction, ActivityAction],
): ActivityAction[] {
  if (Boolean(before) === Boolean(after)) return []
  return [after ? set : cleared]
}

/**
 * The activities of one document: one `updated` with the diff for any
 * metadata change, plus one per trash or archive state flip.
 */
function documentChanges(
  before: DocumentSnapshot,
  after: DocumentSnapshot,
): SnapshotActivity[] {
  const changes = diffSnapshots(before, after)
  const entry = (
    action: ActivityAction,
    entryChanges: ActivityChanges | null,
  ): SnapshotActivity => ({
    documentId: after.id,
    documentName: after.name,
    action,
    changes: entryChanges,
  })
  const flips = [
    ...flip(before.archivedAt, after.archivedAt, ['archived', 'unarchived']),
    ...flip(before.trashedAt, after.trashedAt, ['trashed', 'restored']),
  ]
  return [
    ...(Object.keys(changes).length > 0 ? [entry('updated', changes)] : []),
    ...flips.map((action) => entry(action, null)),
  ]
}

/**
 * Activities for documents present in both lists (matched by id); documents
 * without any change produce none.
 */
export function snapshotActivities(
  before: DocumentSnapshot[],
  after: DocumentSnapshot[],
): SnapshotActivity[] {
  const previous = new Map(before.map((snapshot) => [snapshot.id, snapshot]))
  return after.flatMap((current) => {
    const old = previous.get(current.id)
    return old ? documentChanges(old, current) : []
  })
}

const DEFAULT_ACTIVITY_LIMIT = 10
const MAX_ACTIVITY_LIMIT = 50

/** The dashboard's `limit`, clamped to 1…50; missing or invalid → 10. */
export function readActivityLimit(params: URLSearchParams): number {
  const limit = Number.parseInt(params.get('limit') ?? '', 10)
  if (!Number.isFinite(limit)) return DEFAULT_ACTIVITY_LIMIT
  return Math.min(Math.max(limit, 1), MAX_ACTIVITY_LIMIT)
}
