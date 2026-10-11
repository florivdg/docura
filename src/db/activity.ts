import { randomUUID } from 'node:crypto'
import { asc, eq, inArray } from 'drizzle-orm'

import type { db, Transaction } from '@/db'
import { documentActivity } from '@/db/schema/activity'
import {
  correspondent,
  document,
  documentTag,
  folder,
  tag,
} from '@/db/schema/documents'
import {
  snapshotActivities,
  type ActivityAction,
  type ActivityActor,
  type ActivityChanges,
  type DocumentSnapshot,
  type NamedRef,
} from '@/lib/activity'

/** A transaction, or the plain connection for writes outside one. */
type Executor = Transaction | typeof db

export interface NewActivity {
  /** Null for a document deleted by the same statement (its row is gone). */
  documentId: string | null
  documentName: string
  actor: ActivityActor
  action: ActivityAction
  changes?: ActivityChanges | null
  batchId: string
}

/** Actors of the worker; their name is the source shown in the trail. */
export const SYSTEM_ACTORS = {
  watch: { type: 'system', id: null, name: 'Watch-Ordner' },
  llm: { type: 'system', id: null, name: 'KI-Analyse' },
  trashCleanup: { type: 'system', id: null, name: 'Papierkorb-Bereinigung' },
} as const satisfies Record<string, ActivityActor>

/**
 * Rows per INSERT: eight bind parameters each stay far below the 65,535
 * parameters Postgres accepts per statement, even for a huge trash.
 */
const ACTIVITY_INSERT_CHUNK = 1000

/**
 * Inserts the entries in statements of `ACTIVITY_INSERT_CHUNK` rows; no query
 * without entries. Pass a transaction so a batch shares one `created_at`.
 */
export async function recordActivities(
  tx: Executor,
  entries: NewActivity[],
): Promise<void> {
  const rows = entries.map(({ actor, changes, ...entry }) => ({
    ...entry,
    actorType: actor.type,
    actorId: actor.id,
    actorName: actor.name,
    changes: changes ?? null,
  }))
  for (let start = 0; start < rows.length; start += ACTIVITY_INSERT_CHUNK)
    await tx
      .insert(documentActivity)
      .values(rows.slice(start, start + ACTIVITY_INSERT_CHUNK))
}

/** The same action for every listed document, as one batch. */
export function documentActivities(
  documents: { id: string | null; name: string }[],
  actor: ActivityActor,
  action: ActivityAction,
): NewActivity[] {
  const batchId = randomUUID()
  return documents.map(({ id, name }) => ({
    documentId: id,
    documentName: name,
    actor,
    action,
    batchId,
  }))
}

const nullableRef = (id: string | null, name: string | null) =>
  id && name !== null ? { id, name } : null

/**
 * Reads the documents' audited state in id order; folder and correspondent
 * names come from joins. With `lock`, the rows are locked FOR NO KEY UPDATE
 * OF document: concurrent writers of the same documents wait, while inserts
 * referencing them (key-share locks for tags or activities) do not.
 */
function loadDocumentRows(tx: Executor, ids: string[], lock: boolean) {
  const query = tx
    .select({
      id: document.id,
      name: document.name,
      folderId: document.folderId,
      folderName: folder.name,
      correspondentId: document.correspondentId,
      correspondentName: correspondent.name,
      documentDate: document.documentDate,
      isFavorite: document.isFavorite,
      archivedAt: document.archivedAt,
      trashedAt: document.trashedAt,
    })
    .from(document)
    .leftJoin(folder, eq(document.folderId, folder.id))
    .leftJoin(correspondent, eq(document.correspondentId, correspondent.id))
    .where(inArray(document.id, ids))
    .orderBy(asc(document.id))
  return lock ? query.for('no key update', { of: document }) : query
}

async function loadTagsByDocument(tx: Executor, ids: string[]) {
  const rows = await tx
    .select({ documentId: documentTag.documentId, id: tag.id, name: tag.name })
    .from(documentTag)
    .innerJoin(tag, eq(documentTag.tagId, tag.id))
    .where(inArray(documentTag.documentId, ids))
    .orderBy(asc(tag.name))
  const tags = new Map<string, NamedRef[]>()
  for (const { documentId, id, name } of rows)
    tags.set(documentId, [...(tags.get(documentId) ?? []), { id, name }])
  return tags
}

/**
 * Ids per snapshot query: two bind parameters per id stay far below the
 * 65,535 parameters Postgres accepts per statement (correspondent merges).
 */
export const SNAPSHOT_CHUNK = 10_000

/**
 * The unique ids in Postgres uuid order (lowercase hex compares byte-wise),
 * so chunks queried one after another lock in global id order.
 */
function sortedUniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.toLowerCase()))].sort()
}

async function loadSnapshotChunk(
  tx: Executor,
  ids: string[],
  lock: boolean,
): Promise<DocumentSnapshot[]> {
  const rows = await loadDocumentRows(tx, ids, lock)
  const tags = await loadTagsByDocument(tx, ids)
  return rows.map(
    ({ folderId, folderName, correspondentId, correspondentName, ...row }) => ({
      ...row,
      folder: nullableRef(folderId, folderName),
      correspondent: nullableRef(correspondentId, correspondentName),
      tags: tags.get(row.id) ?? [],
    }),
  )
}

/**
 * The audited state of the documents in id order; missing ids are left out.
 * Locks the rows unless `lock` is false, which callers outside a transaction
 * need (a lock would end with the statement anyway). Large id lists are read
 * in sequential chunks of `SNAPSHOT_CHUNK` ascending ids, so the locks are
 * still acquired in global id order.
 */
export async function loadActivitySnapshots(
  tx: Executor,
  ids: string[],
  { lock = true }: { lock?: boolean } = {},
): Promise<DocumentSnapshot[]> {
  const sorted = sortedUniqueIds(ids)
  const snapshots: DocumentSnapshot[] = []
  for (let start = 0; start < sorted.length; start += SNAPSHOT_CHUNK)
    snapshots.push(
      ...(await loadSnapshotChunk(
        tx,
        sorted.slice(start, start + SNAPSHOT_CHUNK),
        lock,
      )),
    )
  return snapshots
}

/**
 * Runs `mutate` between two snapshots of the documents and records what it
 * changed, one batch for all documents. Unchanged documents get no entry.
 */
export async function withActivity<T>(
  tx: Executor,
  ids: string[],
  actor: ActivityActor,
  mutate: () => Promise<T>,
): Promise<T> {
  const before = await loadActivitySnapshots(tx, ids)
  const result = await mutate()
  const after = await loadActivitySnapshots(tx, ids)
  const batchId = randomUUID()
  await recordActivities(
    tx,
    snapshotActivities(before, after).map((entry) => ({
      ...entry,
      actor,
      batchId,
    })),
  )
  return result
}
