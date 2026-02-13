export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/tiff': 'tiff',
}

export const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
}

export const MAGIC_BYTES: Record<
  string,
  { offset: number; bytes: number[] }[]
> = {
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }], // .PNG
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }], // FFD8FF
  'image/webp': [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
  ],
  'image/tiff': [
    { offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] }, // II*.
  ],
}

export const MAGIC_BYTES_TIFF_BE = [0x4d, 0x4d, 0x00, 0x2a] // MM.*

export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType]
  if (!signatures) return true // no signature to check

  if (mimeType === 'image/tiff') {
    const matchesLE = signatures[0].bytes.every(
      (b, i) => buffer[signatures[0].offset + i] === b,
    )
    const matchesBE = MAGIC_BYTES_TIFF_BE.every((b, i) => buffer[i] === b)
    return matchesLE || matchesBE
  }

  return signatures.every((sig) =>
    sig.bytes.every((b, i) => buffer[sig.offset + i] === b),
  )
}
