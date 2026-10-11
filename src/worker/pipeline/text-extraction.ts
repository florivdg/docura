import { extractPdfOcr, extractPdfText } from '@/worker/clients/ocr'
import { type JobLease, updateStep } from '@/worker/pipeline/job-lifecycle'

export async function extractText(
  doc: { name: string; mimeType: string },
  fileBuffer: Buffer,
  lease: JobLease,
): Promise<string> {
  await updateStep(lease, 'text_extraction')

  let text = await extractPdfText(
    fileBuffer,
    doc.name,
    doc.mimeType,
    lease.signal,
  )

  // If text extraction yielded very little, try OCR
  if (text.length < 50) {
    await updateStep(lease, 'ocr')
    text = await extractPdfOcr(fileBuffer, doc.name, doc.mimeType, lease.signal)
  }

  return text
}
