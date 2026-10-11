import { expect, test } from 'vitest'
import {
  applyDocumentProcessingEvent,
  applyListProcessingEvent,
  jobStateFromEvent,
} from './document-processing-event'
import { detailFixture, jobFixture, rowFixture } from '@/test/document-fixture'
test('updates step, failure details, and requests refreshed metadata on completion', () => {
  const doc = detailFixture({
    processingJobs: [jobFixture({ status: 'pending', attempts: 0 })],
  })
  const event = {
    jobId: 'job',
    documentId: doc.id,
    type: 'step_change',
    status: 'processing',
    kind: 'full',
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
  applyDocumentProcessingEvent(doc, event)
  expect(doc.processingJobs[0].errorMessage).toBe('OCR offline')
  expect(
    applyDocumentProcessingEvent(doc, {
      ...event,
      type: 'completed',
      status: 'completed',
    }),
  ).toBe(true)
  expect(doc.processingJobs[0].errorMessage).toBeNull()
  expect(
    applyDocumentProcessingEvent(detailFixture(), {
      ...event,
      type: 'completed',
      status: 'completed',
    }),
  ).toBe(true)
})

test('updates list rows in place and asks for a refetch when needed', () => {
  const row = rowFixture()
  const event = {
    jobId: 'job',
    documentId: row.id,
    type: 'step_change',
    status: 'processing',
    kind: 'full',
    step: 'ocr',
  } as const
  expect(applyListProcessingEvent([row], event)).toBe(false)
  expect(row).toMatchObject({
    processingStatus: 'processing',
    processingStep: 'ocr',
  })
  expect(
    applyListProcessingEvent([row], {
      ...event,
      type: 'failed',
      status: 'failed',
      step: null,
      errorMessage: 'OCR offline',
    }),
  ).toBe(false)
  expect(row).toMatchObject({
    processingStatus: 'failed',
    processingStep: null,
    processingError: 'OCR offline',
  })
  // Completed runs change AI metadata; unknown rows may be new uploads.
  expect(
    applyListProcessingEvent([row], {
      ...event,
      type: 'completed',
      status: 'completed',
    }),
  ).toBe(true)
  expect(row.processingStatus).toBe('completed')
  expect(applyListProcessingEvent([], event)).toBe(true)
})

test('does not refetch the list for embedding-only runs', () => {
  const row = rowFixture()
  const event = {
    jobId: 'job',
    documentId: row.id,
    type: 'completed',
    status: 'completed',
    kind: 'embedding',
    step: null,
  } as const
  expect(applyListProcessingEvent([row], event)).toBe(false)
  expect(row.processingStatus).toBe('completed')
  expect(applyListProcessingEvent([], event)).toBe(false)
})

test('derives the job state from an event', () => {
  const base = { jobId: 'job', documentId: 'doc', kind: 'full' } as const
  expect(
    jobStateFromEvent({
      ...base,
      type: 'step_change',
      status: 'processing',
      step: 'ocr',
    }),
  ).toEqual({ status: 'processing', step: 'ocr' })
  expect(
    jobStateFromEvent({
      ...base,
      type: 'failed',
      status: 'failed',
      step: null,
    }),
  ).toEqual({ status: 'failed', step: null, errorMessage: null })
  expect(
    jobStateFromEvent({
      ...base,
      type: 'completed',
      status: 'completed',
      step: null,
    }),
  ).toEqual({ status: 'completed', step: null, errorMessage: null })
})
