import { extractImageText } from '@/worker/clients/ocr'
import { type JobLease, updateStep } from '@/worker/pipeline/job-lifecycle'

export async function extractImageOcr(
  doc: { name: string; mimeType: string },
  fileBuffer: Buffer,
  lease: JobLease,
): Promise<string> {
  await updateStep(lease, 'ocr')

  return extractImageText(fileBuffer, doc.name, doc.mimeType, lease.signal)
}
