import { expect, test } from 'vitest'
import {
  csvField,
  metadataCsvChunks,
  metadataJsonChunks,
  type ExportRecord,
} from './export-metadata'

function exportRecord(overrides: Partial<ExportRecord> = {}): ExportRecord {
  return {
    id: 'id-1',
    path: 'Steuer/Rechnung.pdf',
    name: 'Rechnung.pdf',
    mimeType: 'application/pdf',
    fileSize: 10,
    sha256: 'abc',
    folder: 'Steuer',
    correspondent: 'Finanzamt',
    documentDate: '2025-01-31',
    tags: [
      { name: 'Steuer', color: '#f00' },
      { name: 'Wichtig', color: null },
    ],
    isFavorite: false,
    archivedAt: null,
    trashedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    fileMissing: false,
    ...overrides,
  }
}

async function collect(chunks: AsyncIterable<string>) {
  let text = ''
  for await (const chunk of chunks) text += chunk
  return text
}

test('quotes CSV fields with separators, quotes and line breaks', () => {
  expect(csvField(null)).toBe('')
  expect(csvField(12)).toBe('12')
  expect(csvField(true)).toBe('true')
  expect(csvField('a;b')).toBe('"a;b"')
  expect(csvField('Er sagte "Hallo"')).toBe('"Er sagte ""Hallo"""')
  expect(csvField('a\nb')).toBe('"a\nb"')
})

test('neutralizes text that a spreadsheet would run as a formula', () => {
  expect(csvField('=1+1')).toBe("'=1+1")
  expect(csvField('=HYPERLINK("x";"y")')).toBe('"\'=HYPERLINK(""x"";""y"")"')
  expect(csvField('-5 Rechnung')).toBe("'-5 Rechnung")
  expect(csvField('+49 30')).toBe("'+49 30")
  expect(csvField('@x')).toBe("'@x")
  expect(csvField('\tTab')).toBe("'\tTab")
  expect(csvField('\rCR')).toBe('"\'\rCR"')
  expect(csvField('Rechnung = 5')).toBe('Rechnung = 5')
  expect(csvField(-5)).toBe('-5')
  expect(csvField(false)).toBe('false')
  expect(csvField('2026-01-01T00:00:00.000Z')).toBe('2026-01-01T00:00:00.000Z')
})

test('keeps the raw values in metadata.json and neutralizes them in the CSV', async () => {
  const record = exportRecord({
    name: '=cmd.pdf',
    correspondent: '@Absender',
    tags: [{ name: '-Tag', color: null }],
  })
  const json = JSON.parse(
    await collect(
      metadataJsonChunks([record], new Date(), async () => new Map()),
    ),
  )
  expect(json.documents[0]).toMatchObject({
    name: '=cmd.pdf',
    correspondent: '@Absender',
    tags: [{ name: '-Tag', color: null }],
  })
  const [, line] = [...metadataCsvChunks([record])]
  expect(line).toContain(";'=cmd.pdf;")
  expect(line).toContain(";'@Absender;")
  expect(line).toContain(";'-Tag;")
})

test('streams the CSV row by row with BOM, semicolons and joined tags', () => {
  const chunks = [
    ...metadataCsvChunks([
      exportRecord(),
      exportRecord({
        id: 'id-2',
        name: 'a;b.pdf',
        tags: [],
        fileMissing: true,
      }),
    ]),
  ]
  expect(chunks).toHaveLength(3)
  const csv = chunks.join('')
  const lines = csv.split('\r\n')
  expect(csv.startsWith('﻿id;path;name;mimeType;fileSize;sha256;')).toBe(true)
  expect(lines[1]).toBe(
    'id-1;Steuer/Rechnung.pdf;Rechnung.pdf;application/pdf;10;abc;Steuer;Finanzamt;2025-01-31;Steuer|Wichtig;false;;;2026-01-01T00:00:00.000Z;2026-01-02T00:00:00.000Z;false',
  )
  expect(lines[2]).toContain('"a;b.pdf"')
  expect(lines[2].endsWith(';true')).toBe(true)
  expect(lines.at(-1)).toBe('')
})

test('streams metadata.json with texts loaded per batch', async () => {
  const records = Array.from({ length: 501 }, (_, i) =>
    exportRecord({ id: `id-${i}` }),
  )
  const batches: number[] = []
  const chunks: string[] = []
  for await (const chunk of metadataJsonChunks(
    records,
    new Date('2026-02-03T04:05:06Z'),
    async (ids) => {
      batches.push(ids.length)
      return new Map([['id-0', 'Text']])
    },
  ))
    chunks.push(chunk)
  const json = JSON.parse(chunks.join(''))
  expect(batches).toEqual([500, 1])
  // Header, one chunk per document, closing bracket.
  expect(chunks).toHaveLength(503)
  expect(json).toMatchObject({
    version: 1,
    exportedAt: '2026-02-03T04:05:06.000Z',
    count: 501,
  })
  expect(json.documents).toHaveLength(501)
  expect(Object.keys(json.documents[0]).slice(-2)).toEqual([
    'textContent',
    'fileMissing',
  ])
  expect(json.documents[0].textContent).toBe('Text')
  expect(json.documents[1].textContent).toBeNull()
})

test('writes an empty document list', async () => {
  const json = JSON.parse(
    await collect(metadataJsonChunks([], new Date(), async () => new Map())),
  )
  expect(json.documents).toEqual([])
  expect(json.count).toBe(0)
})
