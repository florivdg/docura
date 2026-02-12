import { extractImageText } from '@/worker/clients/ocr'
import { updateStep } from '@/worker/pipeline/job-lifecycle'

export async function extractImageOcr(
  doc: { name: string; mimeType: string },
  fileBuffer: Buffer,
  jobId: string,
  documentId: string,
): Promise<string> {
  await updateStep(jobId, documentId, 'ocr')

  return extractImageText(fileBuffer, doc.name, doc.mimeType)
}
