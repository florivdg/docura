export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
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
