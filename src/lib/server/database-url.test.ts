import { describe, expect, test } from 'vitest'
import { databaseUrlProblem } from './database-url'

const url = (password: string) =>
  `postgresql://docura:${password}@db:5432/docura`

describe('databaseUrlProblem', () => {
  test('reports a missing URL', () => {
    expect(databaseUrlProblem(undefined)).toBe(
      'DATABASE_URL ist nicht gesetzt.',
    )
    expect(databaseUrlProblem('')).toBe('DATABASE_URL ist nicht gesetzt.')
  })

  test.each(['s#cret', 'a/b', 'a?b', 'a%zz', 'p@ss', 'p:ss', 'a b'])(
    'rejects the unencoded password %s',
    (password) => {
      expect(databaseUrlProblem(url(password))).toContain(
        'Erlaubt sind nur Buchstaben und Ziffern',
      )
    },
  )

  test('rejects a string that is no URL', () => {
    expect(databaseUrlProblem('docura')).toContain('DATABASE_URL ist ungültig')
  })

  test.each([
    url('Abc123'),
    'postgresql://docura:p%40ss%2Fw%3Ard@localhost:5433/docura',
    'postgresql://docura@localhost:5433/docura',
    'postgresql://docura:@localhost:5433/docura',
    'postgresql://localhost/docura',
  ])('accepts %s', (value) => {
    expect(databaseUrlProblem(value)).toBeNull()
  })
})
