export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** Date without time, e.g. `01.02.2026`. */
export function formatDate(value: Date | string): string {
  return dateFormatter.format(new Date(value))
}

// Date-only values (YYYY-MM-DD) are rendered in UTC so the day never shifts
const dateOnlyFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})

/** A date-only value such as the Belegdatum (`2026-02-01` → `01.02.2026`). */
export function formatDateOnly(value: string): string {
  return dateOnlyFormatter.format(new Date(`${value}T00:00:00Z`))
}

const dateTimeFormatter = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'short',
  timeStyle: 'medium',
})

/** Date and time with seconds; `–` for a missing or invalid value. */
export function formatDateTime(
  value: Date | string | null | undefined,
): string {
  const date = new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? '–' : dateTimeFormatter.format(date)
}

/** `1 Dokument`, `3 Dokumente`. */
export function documentCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'Dokument' : 'Dokumente'}`
}

/**
 * Sanitize a search headline that may contain `<b>` highlight tags.
 * Preserves `<b>` and `</b>` but escapes all other HTML entities.
 */
export function sanitizeHeadline(html: string): string {
  const OPEN_PH = '\x00BOLD_OPEN\x00'
  const CLOSE_PH = '\x00BOLD_CLOSE\x00'

  let safe = html
    .replaceAll('<b>', OPEN_PH)
    .replaceAll('</b>', CLOSE_PH)
    .replaceAll('<B>', OPEN_PH)
    .replaceAll('</B>', CLOSE_PH)

  safe = safe
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;')

  return safe.replaceAll(OPEN_PH, '<b>').replaceAll(CLOSE_PH, '</b>')
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}
