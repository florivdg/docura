import { WORKER_CONFIG } from '@/worker/config'
import { fetchWithTimeout } from '@/worker/utils/fetch-with-timeout'

type PdfMode = 'text' | 'ocr'
async function requestOcr(
  fileBuffer: Uint8Array,
  fileName: string,
  mimeType: string,
  mode?: PdfMode,
  signal?: AbortSignal,
): Promise<string> {
  const formData = new FormData()
  formData.append(
    'file',
    new Blob([fileBuffer as BlobPart], { type: mimeType }),
    fileName,
  )
  if (mode) formData.append('mode', mode)
  const endpoint = mode ? 'pdf' : 'image'
  const response = await fetchWithTimeout(
    `${WORKER_CONFIG.ocrServiceUrl}/extract/${endpoint}`,
    { method: 'POST', body: formData, signal },
    WORKER_CONFIG.ocrTimeoutMs,
  )
  if (!response.ok) {
    const label =
      mode === 'text' ? 'PDF text' : mode === 'ocr' ? 'PDF OCR' : 'Bild'
    throw new Error(
      `OCR-Service Fehler (${label}): ${response.status} ${response.statusText}`,
    )
  }
  const result = (await response.json()) as { text: string }
  return result.text
}
export function extractPdfText(
  fileBuffer: Uint8Array,
  fileName: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<string> {
  return requestOcr(fileBuffer, fileName, mimeType, 'text', signal)
}
export function extractPdfOcr(
  fileBuffer: Uint8Array,
  fileName: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<string> {
  return requestOcr(fileBuffer, fileName, mimeType, 'ocr', signal)
}
export function extractImageText(
  fileBuffer: Uint8Array,
  fileName: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<string> {
  return requestOcr(fileBuffer, fileName, mimeType, undefined, signal)
}
