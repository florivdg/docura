import { expect, test } from 'vitest'
import {
  buildFolderPaths,
  ExportPathAllocator,
  sanitizeExportName,
} from './export-paths'

test('replaces reserved and control characters and trims dots and spaces', () => {
  expect(sanitizeExportName(' ..a/b\\c:d*e?f"g<h>i|j\u0001.pdf. ')).toBe(
    'a_b_c_d_e_f_g_h_i_j_.pdf',
  )
  expect(sanitizeExportName('...')).toBe('Dokument')
  expect(sanitizeExportName('Ärger über Größe.pdf')).toBe(
    'Ärger über Größe.pdf',
  )
})

test('appends the extension of the MIME type when it is missing', () => {
  expect(sanitizeExportName('Scan', 'image/png')).toBe('Scan.png')
  expect(sanitizeExportName('Foto.JPEG', 'image/jpeg')).toBe('Foto.JPEG')
  expect(sanitizeExportName('Foto.jpg', 'image/jpeg')).toBe('Foto.jpg')
  expect(sanitizeExportName('Vertrag.docx', 'application/pdf')).toBe(
    'Vertrag.docx.pdf',
  )
  expect(sanitizeExportName('Datei', 'text/plain')).toBe('Datei')
})

test('caps long names at 200 bytes while keeping the extension', () => {
  const name = sanitizeExportName(`${'ä'.repeat(150)}.pdf`)
  expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(200)
  expect(name.endsWith('ä.pdf')).toBe(true)
  expect(sanitizeExportName('x'.repeat(300))).toHaveLength(200)
})

test('builds nested folder paths and survives parent cycles', () => {
  const paths = buildFolderPaths([
    { id: 'a', name: 'Steuer', parentId: null },
    { id: 'b', name: '2025/26', parentId: 'a' },
    { id: 'c', name: 'Schleife', parentId: 'd' },
    { id: 'd', name: 'Kreis', parentId: 'c' },
    { id: 'e', name: 'Verwaist', parentId: 'gone' },
  ])
  expect(paths.directory.get('b')).toBe('Steuer/2025_26')
  expect(paths.label.get('b')).toBe('Steuer/2025/26')
  expect(paths.directory.get('c')).toBe('Kreis/Schleife')
  expect(paths.directory.get('e')).toBe('Verwaist')
})

test('resolves collisions case-insensitively per directory', () => {
  const allocator = new ExportPathAllocator(['metadata.json'])
  expect(allocator.allocate('', 'a.pdf')).toBe('a.pdf')
  expect(allocator.allocate('', 'A.pdf')).toBe('A (2).pdf')
  expect(allocator.allocate('', 'a.pdf')).toBe('a (3).pdf')
  expect(allocator.allocate('Ordner', 'a.pdf')).toBe('Ordner/a.pdf')
  expect(allocator.allocate('', 'Metadata.json')).toBe('Metadata (2).json')
  expect(allocator.allocate('', 'README')).toBe('README')
  expect(allocator.allocate('', 'readme')).toBe('readme (2)')
})

test('prefixes Windows device names, also with an extension', () => {
  expect(sanitizeExportName('CON.pdf')).toBe('_CON.pdf')
  expect(sanitizeExportName('nul')).toBe('_nul')
  expect(sanitizeExportName('aux.tar.gz')).toBe('_aux.tar.gz')
  expect(sanitizeExportName('LPT1 .txt')).toBe('_LPT1 .txt')
  expect(sanitizeExportName('com²', 'application/pdf')).toBe('_com².pdf')
  expect(sanitizeExportName('Console.pdf')).toBe('Console.pdf')
  expect(sanitizeExportName('COM10.pdf')).toBe('COM10.pdf')
  expect(
    buildFolderPaths([{ id: 'n', name: 'nul', parentId: null }]).directory.get(
      'n',
    ),
  ).toBe('_nul')
})

test('keeps root folders from shadowing reserved root files', () => {
  const paths = buildFolderPaths(
    [
      { id: 'm', name: 'Metadata.JSON', parentId: null },
      { id: 'n', name: 'metadata.csv', parentId: 'm' },
      { id: 'o', name: 'Ordner', parentId: null },
    ],
    ['metadata.json', 'metadata.csv'],
  )
  expect(paths.directory.get('m')).toBe('Metadata.JSON (Ordner)')
  expect(paths.label.get('m')).toBe('Metadata.JSON')
  // Only the root level holds the metadata files.
  expect(paths.directory.get('n')).toBe('Metadata.JSON (Ordner)/metadata.csv')
  expect(paths.directory.get('o')).toBe('Ordner')
})

test('never hands out a file path that is also a directory', () => {
  const allocator = new ExportPathAllocator(
    ['metadata.json'],
    ['Rechnung.pdf', 'A/B/C'],
  )
  expect(allocator.allocate('', 'rechnung.pdf')).toBe('rechnung (2).pdf')
  expect(allocator.allocate('', 'a')).toBe('a (2)')
  expect(allocator.allocate('A', 'B')).toBe('A/B (2)')
  expect(allocator.allocate('A/B', 'c')).toBe('A/B/c (2)')
  expect(allocator.allocate('A/B/C', 'Datei.pdf')).toBe('A/B/C/Datei.pdf')
  expect(allocator.allocate('', 'B')).toBe('B')
})
