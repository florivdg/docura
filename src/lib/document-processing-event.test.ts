import { expect, test } from 'vitest'
import { applyDocumentProcessingEvent } from './document-processing-event'
import { detailFixture } from '@/test/document-fixture'
test('updates step, failure details, and requests refreshed metadata on completion', () => {
  const doc = detailFixture({
    processingJobs: [
      {
        id: 'job',
        status: 'pending',
        step: null,
        errorMessage: null,
        attempts: 0,
        startedAt: null,
        completedAt: null,
        createdAt: '2026-01-01',
      },
    ],
  })
  const event = {
    jobId: 'job',
    documentId: doc.id,
    type: 'step_change',
    status: 'processing',
    step: 'ocr',
  } as const
  expect(applyDocumentProcessingEvent(doc, event)).toBe(false)
  expect(doc.processingJobs[0].step).toBe('ocr')
  applyDocumentProcessingEvent(doc, {
    ...event,
    type: 'failed',
    status: 'failed',
    errorMessage: 'OCR offline',
  })
  expect(doc.processingJobs[0].errorMessage).toBe('OCR offline')
  expect(doc.processingJobs[0].step).toBeNull()
  expect(
    applyDocumentProcessingEvent(doc, {
      ...event,
      type: 'completed',
      status: 'completed',
    }),
  ).toBe(true)
  expect(
    applyDocumentProcessingEvent(detailFixture(), {
      ...event,
      type: 'completed',
      status: 'completed',
    }),
  ).toBe(true)
})
