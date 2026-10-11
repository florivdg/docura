/** A satisfiable byte range, both ends inclusive. */
export interface ByteRange {
  start: number
  end: number
}

/**
 * `Content-Disposition` with an ASCII fallback for old clients and the exact
 * UTF-8 name per RFC 6266/5987. Inline responses carry the name as well, so
 * "Speichern unter" in the browser's PDF viewer suggests it.
 */
export function contentDisposition(
  type: 'inline' | 'attachment',
  name: string,
): string {
  const fallback = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

const RANGE_RE = /^bytes=(\d*)-(\d*)$/

function rangeBounds(
  first: string,
  last: string,
  size: number,
): ByteRange | 'unsatisfiable' | null {
  if (!first && !last) return null
  if (!first) {
    // Suffix range: the last N bytes.
    const length = Number(last)
    if (length === 0 || size === 0) return 'unsatisfiable'
    return { start: Math.max(size - length, 0), end: size - 1 }
  }
  const start = Number(first)
  if (start >= size) return 'unsatisfiable'
  const end = last ? Number(last) : size - 1
  if (end < start) return null
  return { start, end: Math.min(end, size - 1) }
}

/**
 * Parses a single-range `Range` header for a file of `size` bytes. `null`
 * means "serve the full file" (no header, multiple ranges, other units or
 * a malformed value); `'unsatisfiable'` maps to 416.
 */
export function parseRange(
  header: string | null,
  size: number,
): ByteRange | 'unsatisfiable' | null {
  const match = header?.trim().match(RANGE_RE)
  return match ? rangeBounds(match[1], match[2], size) : null
}

/** Strong ETag from the content hash, otherwise a weak one from size and mtime. */
export function entityTag(
  sha256: string | null,
  size: number,
  mtimeMs: number,
): string {
  return sha256 ? `"${sha256}"` : `W/"${size}-${Math.floor(mtimeMs)}"`
}

/** Whether an `If-None-Match` header matches `etag` (weak comparison). */
export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false
  const bare = (tag: string) => tag.trim().replace(/^W\//, '')
  return header
    .split(',')
    .some((tag) => tag.trim() === '*' || bare(tag) === bare(etag))
}
