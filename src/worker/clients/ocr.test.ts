// @vitest-environment node
import { expect, test, vi } from 'vitest'
import { extractPdfText, extractPdfOcr, extractImageText } from './ocr'
const cases = [
  [extractPdfText, 'pdf', 'text', 'PDF text'],
  [extractPdfOcr, 'pdf', 'ocr', 'PDF OCR'],
  [extractImageText, 'image', null, 'Bild'],
] as const
test.each(cases)(
  'OCR requests retain endpoint, file and mode for %s',
  async (extract, endpoint, mode) => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ text: 'Rechnung' })))
    expect(
      await extract(new Uint8Array([1, 2]), 'file.pdf', 'application/pdf'),
    ).toBe('Rechnung')
    expect(fetch.mock.calls[0][0]).toContain(`/extract/${endpoint}`)
    const form = fetch.mock.calls[0][1]!.body as FormData
    expect(form.get('mode')).toBe(mode)
    expect((form.get('file') as File).name).toBe('file.pdf')
  },
)
test.each(cases)(
  'OCR errors retain the original context for %s',
  async (extract, _endpoint, _mode, label) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    )
    await expect(
      extract(new Uint8Array(), 'file.pdf', 'application/pdf'),
    ).rejects.toThrow(`OCR-Service Fehler (${label}): 500`)
  },
)
