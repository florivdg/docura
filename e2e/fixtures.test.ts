import { expect, test } from 'vitest'
import { createFixtures, randomToken } from './fixtures'

function sequence(...values: number[]) {
  let index = 0
  return () => values[index++ % values.length]
}

test('builds tokens from the OCR-friendly alphabet', () => {
  expect(randomToken(4, sequence(0, 0.99, 0.5, 0.06))).toBe('AYNC')
  expect(randomToken(32)).toMatch(/^[ACDEFHKLMNPRTUVWXY]{32}$/)
})

test('keeps the search tokens out of the file names', () => {
  const fixtures = createFixtures(Math.random, new Date('2026-10-11T12:00:00Z'))
  const { pdf, image } = fixtures
  expect(pdf.name).toBe(`smoke-${fixtures.runId}-rechnung.pdf`)
  expect(image.name).toBe(`smoke-${fixtures.runId}-scan.png`)
  expect(pdf.name.toUpperCase()).not.toContain(pdf.token)
  expect(image.name.toUpperCase()).not.toContain(image.token)
  expect(pdf.html).toContain(pdf.token)
  expect(pdf.html).toContain('Heizöl')
  expect(image.html).toContain(image.token)
  expect(image.html).toContain(image.word)
  expect(fixtures.passkeyName).toContain('2026-10-11T12:00:00.000Z')
})

test('creates different content on every run', () => {
  const first = createFixtures()
  const second = createFixtures()
  expect(first.pdf.token).not.toBe(second.pdf.token)
  expect(first.image.token).not.toBe(second.image.token)
})
