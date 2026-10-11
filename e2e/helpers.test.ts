import { expect, test, vi } from 'vitest'
import {
  check,
  checkNoFailures,
  cleanupComplete,
  errorMessage,
  jobOutcome,
  leftoverLines,
  llmMetadataApplied,
  llmMetadataLine,
  newCorrespondents,
  poll,
  processingDone,
  progressLine,
  redactSecret,
  semanticRank,
  settleEach,
  SmokeError,
  uploadOutcome,
  withTimeout,
} from './helpers'

test('check throws a SmokeError with the message', () => {
  expect(() => check(true, 'nie')).not.toThrow()
  expect(() => check(0, 'kaputt')).toThrow(new SmokeError('kaputt'))
})

test('errorMessage reads errors and other values', () => {
  expect(errorMessage(new Error('weg'))).toBe('weg')
  expect(errorMessage('text')).toBe('text')
})

test('redactSecret replaces every raw occurrence', () => {
  expect(redactSecret('fill("geheim") nach geheim', 'geheim')).toBe(
    'fill("***") nach ***',
  )
})

test('redactSecret replaces the JSON-escaped form of the secret', () => {
  const secret = 'a"b\\c'
  const log = `fill(${JSON.stringify(secret)}) und roh ${secret}`
  const redacted = redactSecret(log, secret)
  expect(redacted).toBe('fill("***") und roh ***')
  expect(redacted).not.toContain('a\\"b')
})

test('redactSecret leaves the message alone for an empty secret', () => {
  expect(redactSecret('nichts zu tun', '')).toBe('nichts zu tun')
})

test('settleEach runs every item and collects the failures', async () => {
  const seen: number[] = []
  const failures = await settleEach([1, 2, 3], async (n) => {
    seen.push(n)
    if (n !== 2) throw new Error(`Fehler ${n}`)
  })
  expect(seen).toEqual([1, 2, 3])
  expect(failures).toEqual(['Fehler 1', 'Fehler 3'])
  await expect(settleEach([1], async () => {})).resolves.toEqual([])
})

test('checkNoFailures lists all failures in one error', () => {
  expect(() => checkNoFailures([], 'x')).not.toThrow()
  expect(() => checkNoFailures(['a', 'b'], 'Nicht gelöscht')).toThrow(
    new SmokeError('Nicht gelöscht: a; b'),
  )
})

function fakeClock() {
  let time = 0
  return {
    now: () => time,
    sleep: vi.fn(async (ms: number) => {
      time += ms
    }),
  }
}

test('poll returns the first defined value', async () => {
  const clock = fakeClock()
  const probe = vi
    .fn<() => Promise<string | undefined>>()
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce('fertig')
  await expect(
    poll(probe, { timeoutMs: 1000, intervalMs: 100, what: 'x', ...clock }),
  ).resolves.toBe('fertig')
  expect(clock.sleep).toHaveBeenCalledTimes(1)
})

test('poll times out with what it waited for', async () => {
  const clock = fakeClock()
  await expect(
    poll(async () => undefined, {
      timeoutMs: 2000,
      intervalMs: 500,
      what: 'Verarbeitung',
      ...clock,
    }),
  ).rejects.toThrow('Zeitüberschreitung nach 2 s: Verarbeitung')
  expect(clock.sleep).toHaveBeenCalledTimes(4)
})

test('poll uses real timers by default', async () => {
  await expect(
    poll(async () => 1, { timeoutMs: 10, intervalMs: 1, what: 'x' }),
  ).resolves.toBe(1)
})

test('poll cuts off a probe that never settles at the deadline', async () => {
  await expect(
    poll(() => new Promise<undefined>(() => {}), {
      timeoutMs: 20,
      intervalMs: 1,
      what: 'Hänger',
    }),
  ).rejects.toThrow('Zeitüberschreitung nach 0 s: Hänger')
})

test('poll stops once a slow probe passed the deadline', async () => {
  let time = 0
  const now = () => time
  const probe = vi.fn(async () => {
    time = 5000
    return undefined
  })
  await expect(
    poll(probe, {
      timeoutMs: 1000,
      intervalMs: 1,
      what: 'Verarbeitung',
      now,
      sleep: async () => {},
    }),
  ).rejects.toThrow('Zeitüberschreitung nach 1 s: Verarbeitung')
  expect(probe).toHaveBeenCalledTimes(1)
})

const job = {
  status: 'failed',
  step: null,
  errorMessage: 'OCR down',
  attempts: 1,
  maxAttempts: 3,
}

test('jobOutcome treats failed jobs with retries left as running', () => {
  expect(jobOutcome(undefined)).toBe('running')
  expect(jobOutcome({ ...job, status: 'processing' })).toBe('running')
  expect(jobOutcome({ ...job, status: 'completed' })).toBe('completed')
  expect(jobOutcome(job)).toBe('running')
  expect(jobOutcome({ ...job, attempts: 3 })).toBe('failed')
})

test('processingDone waits, completes or fails', () => {
  const completed = { ...job, status: 'completed' }
  expect(processingDone([completed, completed])).toBe(true)
  expect(processingDone([completed, job])).toBeUndefined()
  expect(processingDone([completed, undefined])).toBeUndefined()
  expect(() => processingDone([{ ...job, attempts: 3 }])).toThrow(
    'Verarbeitung fehlgeschlagen: OCR down',
  )
  expect(() =>
    processingDone([{ ...job, attempts: 3, errorMessage: null }]),
  ).toThrow('ohne Meldung')
})

test('progressLine lists status and step per job', () => {
  expect(
    progressLine([
      { ...job, status: 'processing', step: 'ocr' },
      { ...job, status: 'completed' },
      undefined,
    ]),
  ).toBe('processing/ocr, completed, unbekannt')
})

test('uploadOutcome returns the document or the rejection reason', () => {
  const document = { id: 'd1', name: 'a.pdf' }
  expect(uploadOutcome(201, { document })).toEqual(document)
  expect(uploadOutcome(409, { error: 'Duplikat' })).toEqual({
    error: 'HTTP 409: Duplikat',
  })
  expect(uploadOutcome(500, null)).toEqual({
    error: 'HTTP 500: unbekannter Fehler',
  })
})

test('withTimeout returns the value in time or fails with what it waited for', async () => {
  await expect(withTimeout(Promise.resolve('da'), 1000, 'x')).resolves.toBe(
    'da',
  )
  await expect(
    withTimeout(new Promise(() => {}), 10, 'Upload-Antworten'),
  ).rejects.toThrow('Zeitüberschreitung nach 0 s: Upload-Antworten')
})

test('semanticRank accepts the target ahead of the control', () => {
  expect(semanticRank(['x', 'pdf', 'bild'], 'pdf', 'bild', 10)).toBe(2)
})

test('semanticRank rejects the target behind the control', () => {
  expect(() => semanticRank(['bild', 'pdf'], 'pdf', 'bild', 10)).toThrow(
    'PDF (Rang 2) nicht vor dem Kontrollbild dieses Laufs (Rang 1)',
  )
})

test('semanticRank rejects a missing target', () => {
  expect(() => semanticRank(['bild'], 'pdf', 'bild', 10)).toThrow(
    'PDF nicht unter den ersten 10 Treffern (Rang –)',
  )
})

test('semanticRank accepts a target in the top N without the control', () => {
  expect(semanticRank(['x', 'pdf'], 'pdf', 'bild', 2)).toBe(2)
})

test('semanticRank rejects a target outside the top N', () => {
  expect(() => semanticRank(['x', 'y', 'pdf'], 'pdf', 'bild', 2)).toThrow(
    'PDF nicht unter den ersten 2 Treffern (Rang 3)',
  )
})

const uploaded = {
  name: 'smoke-abc-rechnung.pdf',
  documentDate: null,
  correspondent: null,
}

test('llmMetadataApplied needs a title, a date or a correspondent', () => {
  expect(llmMetadataApplied(uploaded, uploaded.name)).toBe(false)
  expect(
    llmMetadataApplied({ ...uploaded, name: 'Heizölrechnung' }, uploaded.name),
  ).toBe(true)
  expect(
    llmMetadataApplied(
      { ...uploaded, documentDate: '2026-10-01' },
      uploaded.name,
    ),
  ).toBe(true)
  expect(
    llmMetadataApplied(
      { ...uploaded, correspondent: { id: 'c1', name: 'Stadtwerke' } },
      uploaded.name,
    ),
  ).toBe(true)
})

test('llmMetadataLine shows the detected values or dashes', () => {
  expect(llmMetadataLine(uploaded)).toBe(
    'Titel „smoke-abc-rechnung.pdf“, Korrespondent –, Belegdatum –',
  )
  expect(
    llmMetadataLine({
      name: 'Heizöl',
      documentDate: '2026-10-01',
      correspondent: { id: 'c1', name: 'Stadtwerke' },
    }),
  ).toBe('Titel „Heizöl“, Korrespondent Stadtwerke, Belegdatum 2026-10-01')
})

test('newCorrespondents lists only correspondents missing from the snapshot', () => {
  const candidates = new Map([
    ['alt', 'Stadtwerke'],
    ['neu', 'Heizöl Müller'],
  ])
  expect(newCorrespondents(candidates, new Set(['alt']))).toEqual([
    'Heizöl Müller',
  ])
})

test('newCorrespondents excludes preexisting correspondents', () => {
  const candidates = new Map([['alt', 'Stadtwerke']])
  expect(newCorrespondents(candidates, new Set(['alt']))).toEqual([])
})

test('newCorrespondents without candidates is empty', () => {
  expect(newCorrespondents(new Map(), new Set(['alt']))).toEqual([])
})

const CLEAN = {
  failures: [],
  documentCount: 0,
  passkeyMayExist: false,
  pendingUploads: 0,
}

test('cleanupComplete holds when nothing remains', () => {
  expect(cleanupComplete(CLEAN)).toBe(true)
})

test.each([
  { failures: ['Passkeys nicht abrufbar'] },
  { documentCount: 1 },
  { passkeyMayExist: true },
  { pendingUploads: 1 },
])('cleanupComplete fails on %o', (remaining) => {
  expect(cleanupComplete({ ...CLEAN, ...remaining })).toBe(false)
})

test('leftoverLines lists documents, passkey and pending uploads', () => {
  expect(
    leftoverLines(
      {
        documentIds: ['d1', 'd2'],
        passkeyName: 'Smoke-Test abc',
        pendingUpload: { files: ['a.pdf', 'b.png'], token: 'TOKEN' },
      },
      ['Anmeldung fehlgeschlagen'],
    ),
  ).toEqual([
    'Aufräumen unvollständig: Anmeldung fehlgeschlagen',
    'Bitte manuell löschen: Dokumente d1, d2; Passkey „Smoke-Test abc“.',
    'Ein Upload wurde eventuell trotzdem angenommen: in der Bibliothek nach a.pdf / b.png oder TOKEN suchen.',
  ])
})

test('leftoverLines without reasons blames the missing upload responses', () => {
  expect(leftoverLines({ documentIds: [] }, [])).toEqual([
    'Aufräumen unvollständig: Upload-Antworten fehlen',
    'Bitte manuell löschen: Dokumente keine.',
  ])
})
