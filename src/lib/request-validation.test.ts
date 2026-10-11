import { expect, test } from 'vitest'
import { ApiValidationError } from './api-validation-error'
import { requireJsonObject, uuid, uuidList } from './request-validation'

const lower = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const upper = lower.toUpperCase()
const messages = { emptyMessage: 'leer', invalidMessage: 'ungültig' }

test('uuid returns the canonical lowercase form', () => {
  expect(uuid(upper, 'ungültig')).toBe(lower)
  expect(uuid(lower, 'ungültig')).toBe(lower)
  expect(() => uuid('bad', 'ungültig')).toThrow(ApiValidationError)
  expect(() => uuid(42, 'ungültig')).toThrow('ungültig')
})

test('uuidList de-duplicates ids regardless of case', () => {
  expect(uuidList([upper, lower], messages)).toEqual([lower])
  expect(uuidList([], { ...messages, allowEmpty: true })).toEqual([])
  expect(() => uuidList([], messages)).toThrow('leer')
  expect(() => uuidList('x', messages)).toThrow('leer')
  expect(() => uuidList(['bad'], messages)).toThrow('ungültig')
  const max = { count: 1, label: 'Dokumente' }
  expect(() => uuidList([lower, lower], { ...messages, max })).toThrow(
    'Zu viele Dokumente ausgewählt (maximal 1)',
  )
})

test('requireJsonObject rejects non-object bodies', () => {
  expect(requireJsonObject({ a: 1 })).toEqual({ a: 1 })
  for (const body of [null, [], 'x', 1])
    expect(() => requireJsonObject(body)).toThrow('Ungültiger JSON-Body')
})
