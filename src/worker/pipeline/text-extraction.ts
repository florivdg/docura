import { extractPdfOcr, extractPdfText } from '@/worker/clients/ocr'
import { updateStep } from '@/worker/pipeline/job-lifecycle'

export async function extractText(
  doc: { name: string; mimeType: string },
  fileBuffer: Buffer,
  jobId: string,
  documentId: string,
): Promise<string> {
  await updateStep(jobId, documentId, 'text_extraction')

  let text = await extractPdfText(fileBuffer, doc.name, doc.mimeType)

  // If text extraction yielded very little, try OCR
  if (text.length < 50) {
    await updateStep(jobId, documentId, 'ocr')
    text = await extractPdfOcr(fileBuffer, doc.name, doc.mimeType)
  }

  return text
}
