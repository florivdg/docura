import { WORKER_CONFIG } from '@/worker/config'
import { fetchWithTimeout } from '@/worker/utils/fetch-with-timeout'

export async function extractPdfText(
  fileBuffer: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const formData = new FormData()
  formData.append(
    'file',
    new Blob([fileBuffer as BlobPart], { type: mimeType }),
    fileName,
  )
  formData.append('mode', 'text')

  const response = await fetchWithTimeout(
    `${WORKER_CONFIG.ocrServiceUrl}/extract/pdf`,
    { method: 'POST', body: formData },
    WORKER_CONFIG.ocrTimeoutMs,
  )
  if (!response.ok) {
    throw new Error(
      `OCR-Service Fehler (PDF text): ${response.status} ${response.statusText}`,
    )
  }
  const result = (await response.json()) as { text: string }
  return result.text
}

export async function extractPdfOcr(
  fileBuffer: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const formData = new FormData()
  formData.append(
    'file',
    new Blob([fileBuffer as BlobPart], { type: mimeType }),
    fileName,
  )
  formData.append('mode', 'ocr')

  const response = await fetchWithTimeout(
    `${WORKER_CONFIG.ocrServiceUrl}/extract/pdf`,
    { method: 'POST', body: formData },
    WORKER_CONFIG.ocrTimeoutMs,
  )
  if (!response.ok) {
    throw new Error(
      `OCR-Service Fehler (PDF OCR): ${response.status} ${response.statusText}`,
    )
  }
  const result = (await response.json()) as { text: string }
  return result.text
}

export async function extractImageText(
  fileBuffer: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const formData = new FormData()
  formData.append(
    'file',
    new Blob([fileBuffer as BlobPart], { type: mimeType }),
    fileName,
  )

  const response = await fetchWithTimeout(
    `${WORKER_CONFIG.ocrServiceUrl}/extract/image`,
    { method: 'POST', body: formData },
    WORKER_CONFIG.ocrTimeoutMs,
  )
  if (!response.ok) {
    throw new Error(
      `OCR-Service Fehler (Bild): ${response.status} ${response.statusText}`,
    )
  }
  const result = (await response.json()) as { text: string }
  return result.text
}
