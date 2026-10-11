// @vitest-environment node
import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js'
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import type { ExportDocumentRow } from '@/lib/export-metadata'
import { tempDir } from '@/test/temp-dir'
import {
  exportFileName,
  exportResponseHeaders,
  exportZipStream,
  writeExportZip,
  type ExportSource,
} from './export-zip'

const uploadDir = tempDir('export')
writeFileSync(join(uploadDir, 'a.pdf'), '%PDF-a')
writeFileSync(join(uploadDir, 'b.png'), 'png')

function row(overrides: Partial<ExportDocumentRow>): ExportDocumentRow {
  return {
    id: 'id',
    name: 'Rechnung.pdf',
    mimeType: 'application/pdf',
    fileSize: 6,
    storagePath: 'a.pdf',
    sha256: null,
    folderId: null,
    correspondent: null,
    documentDate: null,
    tags: [],
    isFavorite: false,
    archivedAt: null,
    trashedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

const rows = [
  row({ id: 'a', folderId: 'f2', tags: [{ name: 'Steuer', color: null }] }),
  row({ id: 'b', name: 'Scan', mimeType: 'image/png', storagePath: 'b.png' }),
  row({ id: 'c', name: 'Weg.pdf', storagePath: 'missing.pdf' }),
  row({ id: 'd', name: 'Ausbruch.pdf', storagePath: '../a.pdf' }),
]

const source: ExportSource = {
  ids: rows.map((r) => r.id),
  folders: [
    { id: 'f1', name: 'Steuer', parentId: null },
    { id: 'f2', name: '2025', parentId: 'f1' },
  ],
  loadRows: async (ids) => rows.filter((r) => ids.includes(r.id)),
  loadTexts: async () => new Map([['a', 'Volltext']]),
}

async function readZip(blob: Blob) {
  const reader = new ZipReader(new BlobReader(blob))
  const entries = await reader.getEntries()
  const files = new Map<string, string>()
  for (const entry of entries)
    if (!entry.directory)
      files.set(entry.filename, await entry.getData(new TextWriter()))
  await reader.close()
  return files
}

test('writes files in their folders plus JSON and CSV metadata', async () => {
  const { readable, writable } = new TransformStream()
  const blob = new Response(readable).blob()
  const count = await writeExportZip(writable, source, {
    uploadDir,
    now: new Date('2026-03-04T05:06:07Z'),
  })
  expect(count).toBe(4)
  const files = await readZip(await blob)
  expect([...files.keys()]).toEqual([
    'Steuer/2025/Rechnung.pdf',
    'Scan.png',
    'metadata.json',
    'metadata.csv',
  ])
  expect(files.get('Steuer/2025/Rechnung.pdf')).toBe('%PDF-a')
  const metadata = JSON.parse(files.get('metadata.json')!)
  expect(metadata.exportedAt).toBe('2026-03-04T05:06:07.000Z')
  expect(metadata.documents[0]).toMatchObject({
    path: 'Steuer/2025/Rechnung.pdf',
    folder: 'Steuer/2025',
    tags: [{ name: 'Steuer', color: null }],
    textContent: 'Volltext',
    fileMissing: false,
  })
  expect(
    metadata.documents
      .slice(2)
      .map((d: { fileMissing: boolean }) => d.fileMissing),
  ).toEqual([true, true])
  const csv = files.get('metadata.csv')!.split('\r\n')
  expect(csv).toHaveLength(6)
  expect(csv[3]).toContain('Weg.pdf;application/pdf')
})

test.skipIf(process.getuid?.() === 0)(
  'flags an unreadable file as missing and keeps the archive intact',
  async () => {
    writeFileSync(join(uploadDir, 'locked.pdf'), 'secret')
    chmodSync(join(uploadDir, 'locked.pdf'), 0o000)
    const lockedRows = [
      row({ id: 'l', name: 'Gesperrt.pdf', storagePath: 'locked.pdf' }),
      row({ id: 'a' }),
    ]
    const body = exportZipStream(
      {
        ...source,
        ids: ['l', 'a'],
        folders: [],
        loadRows: async () => lockedRows,
      },
      { uploadDir },
    )
    const files = await readZip(await new Response(body).blob())
    expect([...files.keys()]).toEqual([
      'Rechnung.pdf',
      'metadata.json',
      'metadata.csv',
    ])
    expect(files.get('Rechnung.pdf')).toBe('%PDF-a')
    const metadata = JSON.parse(files.get('metadata.json')!)
    expect(
      metadata.documents.map((d: { fileMissing: boolean }) => d.fileMissing),
    ).toEqual([true, false])
  },
)

test('keeps folder and file paths in one namespace', async () => {
  const clashing: ExportSource = {
    ids: ['a', 'b', 'c'],
    folders: [
      { id: 'm', name: 'metadata.json', parentId: null },
      { id: 'r', name: 'Rechnung.pdf', parentId: null },
    ],
    loadRows: async () => [
      row({ id: 'a', folderId: 'm' }),
      row({ id: 'b', folderId: 'r' }),
      row({ id: 'c' }),
    ],
    loadTexts: async () => new Map(),
  }
  const body = exportZipStream(clashing, { uploadDir })
  const paths = [...(await readZip(await new Response(body).blob())).keys()]
  expect(paths).toEqual([
    'metadata.json (Ordner)/Rechnung.pdf',
    'Rechnung.pdf/Rechnung.pdf',
    'Rechnung (2).pdf',
    'metadata.json',
    'metadata.csv',
  ])
  const lower = paths.map((p) => p.toLowerCase())
  for (const p of lower)
    expect(lower.some((other) => other.startsWith(`${p}/`))).toBe(false)
})

test('streams the archive as a response body', async () => {
  const body = exportZipStream(source, { uploadDir })
  const files = await readZip(await new Response(body).blob())
  expect(files.has('metadata.csv')).toBe(true)
})

test('errors the stream when the export fails', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const failing: ExportSource = {
    ...source,
    loadRows: async () => {
      throw new Error('db down')
    },
  }
  const controller = new AbortController()
  controller.abort()
  const aborted = exportZipStream(source, {
    uploadDir,
    signal: controller.signal,
  })
  await expect(new Response(aborted).blob()).rejects.toThrow()
  const body = exportZipStream(failing, { uploadDir })
  await expect(new Response(body).blob()).rejects.toThrow('db down')
  expect(log).toHaveBeenCalledTimes(1)
})

test('names the download after the export time', () => {
  const now = new Date(2026, 0, 2, 3, 4)
  expect(exportFileName(now)).toBe('docura-export-20260102-0304.zip')
  expect(exportResponseHeaders(now)).toMatchObject({
    'Content-Type': 'application/zip',
    'Cache-Control': 'no-store',
    'Content-Disposition': expect.stringContaining(
      'attachment; filename="docura-export-20260102-0304.zip"',
    ),
  })
})
