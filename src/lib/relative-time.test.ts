import { expect, test } from 'vitest'
import { relativeTime } from './relative-time'

const now = Date.parse('2026-06-15T12:00:00Z')
const ago = (seconds: number) =>
  relativeTime(new Date(now - seconds * 1000).toISOString(), now)

test('picks the largest fitting unit', () => {
  expect(ago(0)).toBe('jetzt')
  expect(ago(30)).toBe('vor 30 Sekunden')
  expect(ago(5 * 60)).toBe('vor 5 Minuten')
  expect(ago(3 * 3600)).toBe('vor 3 Stunden')
  expect(ago(86_400)).toBe('gestern')
  expect(ago(10 * 86_400)).toBe('vor 10 Tagen')
  expect(ago(90 * 86_400)).toBe('vor 3 Monaten')
  expect(ago(800 * 86_400)).toBe('vor 2 Jahren')
})

test('defaults to the current time', () => {
  expect(relativeTime(new Date().toISOString())).toBe('jetzt')
})
