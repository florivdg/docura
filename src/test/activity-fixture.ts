import type { ActivityEntry, ActivityGroup } from '@/lib/activity'

/** A row of the activity snapshot query (document joined with its names). */
export function snapshotRow(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name: 'Rechnung.pdf',
    folderId: null,
    folderName: null,
    correspondentId: null,
    correspondentName: null,
    documentDate: null,
    isFavorite: false,
    archivedAt: null,
    trashedAt: null,
    ...overrides,
  }
}

/** A history entry: Anna uploaded the document just now. */
export function entryFixture(
  overrides: Partial<ActivityEntry> = {},
): ActivityEntry {
  return {
    id: 'e1',
    documentId: 'doc',
    documentName: 'Rechnung.pdf',
    actorType: 'user',
    actorId: 'u1',
    actorName: 'Anna',
    action: 'uploaded',
    changes: null,
    batchId: 'b1',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

/** A dashboard group: Anna trashed one document just now. */
export function groupFixture(
  overrides: Partial<ActivityGroup> = {},
): ActivityGroup {
  return {
    batchId: 'b1',
    action: 'trashed',
    actorType: 'user',
    actorId: 'u1',
    actorName: 'Anna',
    createdAt: new Date().toISOString(),
    count: 1,
    document: { id: 'doc', name: 'Rechnung.pdf' },
    changes: null,
    ...overrides,
  }
}
