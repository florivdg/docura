// @vitest-environment node
import { BlobReader, ZipReader } from '@zip.js/zip.js'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseExportArgs, writeExportFile } from './export-cli'
import type { ExportSource } from './export-zip'
import { tempDir } from '@/test/temp-dir'

const now = new Date(2026, 4, 6, 7, 8)

test('parses the export flags with a timestamped default file name', () => {
  expect(parseExportArgs([], now)).toEqual({
    out: 'docura-export-20260506-0708.zip',
    includeArchived: false,
    includeTrash: false,
  })
  expect(
    parseExportArgs(
      ['--out', 'x.zip', '--include-archived', '--include-trash'],
      now,
    ),
  ).toEqual({ out: 'x.zip', includeArchived: true, includeTrash: true })
  expect(() => parseExportArgs(['--out'], now)).toThrow('--out')
  expect(() => parseExportArgs(['--all'], now)).toThrow('--all')
})

const emptySource: ExportSource = {
  ids: [],
  folders: [],
  loadRows: async () => [],
  loadTexts: async () => new Map(),
}

test('writes the archive via a partial file', async () => {
  const dir = tempDir('cli')
  const out = join(dir, 'export.zip')
  expect(await writeExportFile(out, emptySource, dir)).toBe(0)
  expect(readdirSync(dir)).toEqual(['export.zip'])
  const reader = new ZipReader(new BlobReader(new Blob([readFileSync(out)])))
  const names = (await reader.getEntries()).map((entry) => entry.filename)
  expect(names).toEqual(['metadata.json', 'metadata.csv'])
})

test('removes the partial file when the export fails', async () => {
  const dir = tempDir('cli')
  const failing = {
    ...emptySource,
    ids: ['a'],
    loadRows: async () => {
      throw new Error('db down')
    },
  }
  await expect(
    writeExportFile(join(dir, 'export.zip'), failing, dir),
  ).rejects.toThrow('db down')
  expect(existsSync(join(dir, 'export.zip.partial'))).toBe(false)
})
