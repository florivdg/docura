import type {
  ActivityAction,
  ActivityChanges,
  ActivityField,
  FieldChange,
  NamedRef,
} from './activity'
import { documentCountLabel, formatDateOnly } from './format'

/** What a sentence needs: entries describe one document, groups `count`. */
interface ActivitySubject {
  action: ActivityAction
  actorName: string
  changes: ActivityChanges | null
  count?: number
}

/**
 * The predicate per action; `{doc}` is the accusative object („das
 * Dokument“, „12 Dokumente“), `{of}` the dative one („von 12 Dokumenten“,
 * empty for a single document).
 */
const PREDICATES: Record<ActivityAction, string> = {
  uploaded: 'hat {doc} hochgeladen',
  updated: 'hat die Metadaten{of} geändert',
  archived: 'hat {doc} archiviert',
  unarchived: 'hat die Archivierung{of} aufgehoben',
  trashed: 'hat {doc} in den Papierkorb verschoben',
  restored: 'hat {doc} wiederhergestellt',
  deleted: 'hat {doc} endgültig gelöscht',
  reprocess_requested: 'hat die Neuverarbeitung{of} gestartet',
}

/** A group that only moved documents reads as a move, not a metadata edit. */
function predicate({ action, changes }: ActivitySubject): string {
  const fields = Object.keys(changes ?? {})
  if (action === 'updated' && fields.length === 1 && fields[0] === 'folder')
    return 'hat {doc} verschoben'
  return PREDICATES[action]
}

/** „Anna hat das Dokument hochgeladen“, „KI-Analyse hat 2 Dokumente verschoben“. */
export function describeActivity(subject: ActivitySubject): string {
  const count = subject.count ?? 1
  const text = predicate(subject)
    .replace('{doc}', count > 1 ? documentCountLabel(count) : 'das Dokument')
    .replace('{of}', count > 1 ? ` von ${count} Dokumenten` : '')
  return `${subject.actorName} ${text}`
}

const FIELD_LABELS: Record<ActivityField, string> = {
  name: 'Name',
  folder: 'Ordner',
  correspondent: 'Korrespondent',
  documentDate: 'Belegdatum',
  tags: 'Tags',
  isFavorite: 'Favorit',
}

const EMPTY = '–'

type FieldValue = string | boolean | NamedRef | null

function formatValue(field: ActivityField, value: FieldValue): string {
  if (value === null || value === '') return EMPTY
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein'
  if (typeof value === 'object') return value.name
  return field === 'documentDate' ? formatDateOnly(value) : value
}

/** Added tags with „+“, removed ones with „−“. */
function formatTagChange({ from, to }: FieldChange<NamedRef[]>): string {
  const before = new Set(from.map((tag) => tag.id))
  const after = new Set(to.map((tag) => tag.id))
  const parts = [
    ...to.filter((tag) => !before.has(tag.id)).map((tag) => `+${tag.name}`),
    ...from.filter((tag) => !after.has(tag.id)).map((tag) => `−${tag.name}`),
  ]
  return parts.length > 0 ? parts.join(', ') : EMPTY
}

/** „Ordner: Steuer → Versicherung“, „Tags: +Rechnung, −Entwurf“. */
export function formatChange<F extends ActivityField>(
  field: F,
  change: NonNullable<ActivityChanges[F]>,
): string {
  const label = FIELD_LABELS[field]
  if (field === 'tags')
    return `${label}: ${formatTagChange(change as FieldChange<NamedRef[]>)}`
  const { from, to } = change as FieldChange<FieldValue>
  return `${label}: ${formatValue(field, from)} → ${formatValue(field, to)}`
}

/** One line per changed field, in a fixed order. */
export function changeLines(changes: ActivityChanges | null): string[] {
  if (!changes) return []
  return (Object.keys(FIELD_LABELS) as ActivityField[]).flatMap((field) => {
    const change = changes[field]
    return change ? [formatChange(field, change)] : []
  })
}
