import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { beforeEach, expect, test, vi } from 'vitest'

const calls: string[] = []
const dialect = new PgDialect()
/** Rows returned by the journal queries, in order. */
let journalRows: unknown[][] = []
const execute = vi.fn(async (query: SQL) => {
  const text = dialect.sqlToQuery(query).sql
  calls.push(text)
  return text.startsWith('CREATE EXTENSION') ? [] : (journalRows.shift() ?? [])
})
const migrate = vi.fn(
  async (_db: unknown, config: { migrationsFolder: string }) => {
    calls.push(`migrate ${config.migrationsFolder}`)
  },
)
vi.doMock('@/db', () => ({ db: { execute } }))
vi.doMock('drizzle-orm/bun-sql/migrator', () => ({ migrate }))
const { migrationSummary, runMigrations } = await import('./migrations')

beforeEach(() => {
  calls.length = 0
  journalRows = []
  migrate.mockClear()
})

test('creates the extensions before migrating and counts new migrations', async () => {
  // No journal table yet, then 8 rows after migrating.
  journalRows = [[{ exists: false }], [{ exists: true }], [{ count: '8' }]]
  expect(await runMigrations()).toBe(8)
  expect(calls.slice(0, 2)).toEqual([
    'CREATE EXTENSION IF NOT EXISTS vector',
    'CREATE EXTENSION IF NOT EXISTS pg_trgm',
  ])
  expect(calls).toContain('migrate ./drizzle')
  expect(calls.indexOf('migrate ./drizzle')).toBeGreaterThan(1)
})

test('reports nothing applied on an up-to-date database', async () => {
  journalRows = [
    [{ exists: true }],
    [{ count: 8 }],
    [{ exists: true }],
    [{ count: 8 }],
  ]
  expect(await runMigrations('/app/drizzle')).toBe(0)
  expect(migrate).toHaveBeenCalledWith(expect.anything(), {
    migrationsFolder: '/app/drizzle',
  })
})

test('propagates migration errors', async () => {
  journalRows = [[{ exists: false }]]
  migrate.mockRejectedValueOnce(new Error('kaputt'))
  await expect(runMigrations()).rejects.toThrow('kaputt')
})

test('summarizes the result in German', () => {
  expect(migrationSummary(0)).toContain('keine Migrationen ausstehend')
  expect(migrationSummary(1)).toBe('1 Migration angewendet.')
  expect(migrationSummary(3)).toBe('3 Migrationen angewendet.')
})
