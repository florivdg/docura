import { isValidIsoDate } from '@/lib/api-utils'

export function chunkText(
  text: string,
  chunkSize = 8000,
  overlap = 200,
): string[] {
  if (text.length <= chunkSize) return [text]
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.substring(i, i + chunkSize))
  }
  return chunks
}

export function sanitizeTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let title = value.trim()

  // Strip surrounding quotes
  if (
    (title.startsWith('"') && title.endsWith('"')) ||
    (title.startsWith('\u201E') && title.endsWith('\u201C')) ||
    (title.startsWith("'") && title.endsWith("'"))
  ) {
    title = title.slice(1, -1).trim()
  }

  // Remove trailing period
  if (title.endsWith('.')) title = title.slice(0, -1).trim()

  // Length bounds
  if (title.length < 2 || title.length > 200) return null

  return title
}

export function sanitizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 50)
    .slice(0, 5)
}

export function sanitizeFolderSuggestion(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > 100) return null
  return trimmed
}

export function sanitizeDocumentDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  if (!isValidIsoDate(trimmed)) return null

  // Plausibility bounds
  const year = Number(trimmed.slice(0, 4))
  const maxYear = new Date().getFullYear() + 1
  if (year < 1900 || year > maxYear) return null

  return trimmed
}

export function sanitizeCorrespondent(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length < 2 || trimmed.length > 120) return null
  return trimmed
}
