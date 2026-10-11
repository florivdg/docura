// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { tempDir } from '@/test/temp-dir'
import { safePathOrNull, statFile } from './api-utils'

const dir = tempDir('stored')
writeFileSync(join(dir, 'a.pdf'), 'abc')

test('resolves storage paths inside the upload directory only', () => {
  expect(safePathOrNull(dir, 'a.pdf')).toBe(join(dir, 'a.pdf'))
  expect(safePathOrNull(dir, '../a.pdf')).toBeNull()
})

test('stats existing files and maps a missing one to null', async () => {
  expect((await statFile(join(dir, 'a.pdf')))?.size).toBe(3)
  expect(await statFile(join(dir, 'missing.pdf'))).toBeNull()
  await expect(statFile(join(dir, 'a.pdf', 'child'))).rejects.toThrow()
})
