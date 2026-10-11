import { expect, test } from 'vitest'
import {
  contentDisposition,
  entityTag,
  etagMatches,
  parseRange,
} from './http-headers'

test('content disposition carries an ASCII fallback and the UTF-8 name', () => {
  expect(contentDisposition('inline', 'Rechnung.pdf')).toBe(
    `inline; filename="Rechnung.pdf"; filename*=UTF-8''Rechnung.pdf`,
  )
  expect(contentDisposition('attachment', 'Übersicht "Q1" (neu)€.pdf')).toBe(
    `attachment; filename="Ubersicht _Q1_ (neu)_.pdf"; filename*=UTF-8''%C3%9Cbersicht%20%22Q1%22%20%28neu%29%E2%82%AC.pdf`,
  )
})

test('parses single byte ranges and clamps them to the file size', () => {
  expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 })
  expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 })
  expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
  expect(parseRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 })
  expect(parseRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 })
})

test('serves the full file for missing, malformed and multi ranges', () => {
  expect(parseRange(null, 100)).toBeNull()
  expect(parseRange('bytes=-', 100)).toBeNull()
  expect(parseRange('bytes=9-1', 100)).toBeNull()
  expect(parseRange('items=0-1', 100)).toBeNull()
  expect(parseRange('bytes=0-1,5-6', 100)).toBeNull()
})

test('reports unsatisfiable ranges', () => {
  expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable')
  expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable')
  expect(parseRange('bytes=-5', 0)).toBe('unsatisfiable')
})

test('builds strong and weak entity tags and matches If-None-Match', () => {
  expect(entityTag('abc', 1, 2)).toBe('"abc"')
  expect(entityTag(null, 10, 1234.5)).toBe('W/"10-1234"')
  expect(etagMatches(null, '"abc"')).toBe(false)
  expect(etagMatches('"x", W/"abc"', '"abc"')).toBe(true)
  expect(etagMatches('*', '"abc"')).toBe(true)
  expect(etagMatches('"x"', '"abc"')).toBe(false)
})
