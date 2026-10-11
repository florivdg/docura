import { ALLOWED_MIME_TYPES } from './file-validation'

/** Byte cap per path segment; common file systems allow 255. */
const MAX_NAME_BYTES = 200
const FALLBACK_NAME = 'Dokument'
const encoder = new TextEncoder()

// oxlint-disable-next-line no-control-regex -- control characters are exactly what is replaced.
const UNSAFE_CHARS = /[/\\:*?"<>|\u0000-\u001f\u007f]/g

function splitExtension(name: string): [string, string] {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
}

/** Cuts `value` to at most `maxBytes` UTF-8 bytes without splitting a character. */
function truncateBytes(value: string, maxBytes: number): string {
  let result = ''
  let bytes = 0
  for (const char of value) {
    bytes += encoder.encode(char).length
    if (bytes > maxBytes) break
    result += char
  }
  return result
}

/** Windows device names; also reserved with an extension (`CON.pdf`). */
const DEVICE_NAME = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i

/** Prefixes `_` when the part before the first dot is a Windows device name. */
function avoidDeviceName(name: string): string {
  const stem = name.split('.', 1)[0].trimEnd()
  return DEVICE_NAME.test(stem) ? `_${name}` : name
}

function cleanSegment(value: string): string {
  return value.replace(UNSAFE_CHARS, '_').replace(/^[\s.]+|[\s.]+$/g, '')
}

function withExtension(name: string, mimeType: string | null): string {
  const expected = mimeType ? ALLOWED_MIME_TYPES[mimeType] : undefined
  if (!expected) return name
  const [, ext] = splitExtension(name)
  const known = ext.slice(1).toLowerCase()
  const aliases = expected === 'jpg' ? ['jpg', 'jpeg'] : [expected]
  return aliases.includes(known) ? name : `${name}.${expected}`
}

/**
 * A file or folder name that is safe on every common file system: path
 * separators, reserved and control characters become `_`, leading and
 * trailing dots and spaces are removed and the name is capped at 200 bytes
 * while keeping its extension. With a `mimeType`, a missing extension is
 * appended. Windows device names (`CON`, `nul.pdf`, `LPT1.txt`, …) get a
 * leading `_`.
 */
export function sanitizeExportName(
  name: string,
  mimeType: string | null = null,
): string {
  return avoidDeviceName(
    capBytes(withExtension(cleanSegment(name) || FALLBACK_NAME, mimeType)),
  )
}

function capBytes(name: string): string {
  if (encoder.encode(name).length <= MAX_NAME_BYTES) return name
  const [base, ext] = splitExtension(name)
  const keptExt = truncateBytes(ext, 20)
  const keptBase = truncateBytes(base, MAX_NAME_BYTES - keptExt.length)
  return `${cleanSegment(keptBase) || FALLBACK_NAME}${keptExt}`
}

export interface FolderNode {
  id: string
  name: string
  parentId: string | null
}

/** Raw folder names from the root down to `id`. */
function folderSegments(id: string, byId: Map<string, FolderNode>): string[] {
  const segments: string[] = []
  const seen = new Set<string>()
  let current = byId.get(id)
  // The seen-set guards against a parent cycle in inconsistent data.
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    segments.unshift(current.name)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return segments
}

export interface FolderPaths {
  /** Sanitized directory inside the archive, e.g. `Steuer/2025`. */
  directory: Map<string, string>
  /** Readable folder path for the metadata, e.g. `Steuer/2025`. */
  label: Map<string, string>
}

/** Appended to a root folder whose name equals a reserved root file. */
const RESERVED_FOLDER_SUFFIX = ' (Ordner)'

/**
 * Paths of all folders, built from one flat folder list. A root folder named
 * like one of `reservedRootNames` (the metadata files, compared
 * case-insensitively) becomes `<name> (Ordner)`, so no directory shadows
 * them. Sibling folders that differ only in case share a directory.
 */
export function buildFolderPaths(
  folders: FolderNode[],
  reservedRootNames: string[] = [],
): FolderPaths {
  const byId = new Map(folders.map((node) => [node.id, node]))
  const reserved = new Set(reservedRootNames.map((name) => name.toLowerCase()))
  const paths: FolderPaths = { directory: new Map(), label: new Map() }
  for (const { id } of folders) {
    const segments = folderSegments(id, byId)
    const [root, ...rest] = segments.map((segment) =>
      sanitizeExportName(segment),
    )
    const rootDirectory = reserved.has(root.toLowerCase())
      ? `${root}${RESERVED_FOLDER_SUFFIX}`
      : root
    paths.label.set(id, segments.join('/'))
    paths.directory.set(id, [rootDirectory, ...rest].join('/'))
  }
  return paths
}

/**
 * Hands out unique archive paths. Names compare case-insensitively per
 * directory, so the archive also extracts on macOS and Windows; collisions
 * become `name (2).pdf`, `name (3).pdf`, … Files and directories share one
 * namespace: a file never gets the path of a directory or of one of its
 * parents.
 */
export class ExportPathAllocator {
  private readonly used = new Set<string>()

  /**
   * `reserved` root names (the metadata files) are never handed out, nor
   * any directory path in `directories` (`A/B` reserves `A` and `A/B`).
   */
  constructor(reserved: string[] = [], directories: Iterable<string> = []) {
    for (const name of reserved) this.used.add(this.key('', name))
    for (const directory of directories) {
      const segments = directory.split('/')
      segments.forEach((segment, i) =>
        this.used.add(this.key(segments.slice(0, i).join('/'), segment)),
      )
    }
  }

  allocate(directory: string, fileName: string): string {
    const [base, ext] = splitExtension(fileName)
    let candidate = fileName
    for (let n = 2; this.used.has(this.key(directory, candidate)); n++)
      candidate = `${base} (${n})${ext}`
    this.used.add(this.key(directory, candidate))
    return directory ? `${directory}/${candidate}` : candidate
  }

  private key(directory: string, name: string): string {
    return `${directory}/${name}`.toLowerCase()
  }
}
