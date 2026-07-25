import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export function computeSha256(data: Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/** Streams the file through SHA-256 without loading it into memory. */
export async function computeFileSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}
