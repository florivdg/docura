import { expect, test } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { fulltextExpressions } from './fulltext-expressions'
const dialect = new PgDialect()
test('keeps wildcard searches parameterized and escapes LIKE metacharacters', () => {
  const query = fulltextExpressions("Rechnung%_' OR 1=1")
  const name = dialect.sqlToQuery(query.searchConditions[0])
  expect(name.sql).not.toContain('OR 1=1')
  expect(name.params[0]).toBe("%Rechnung\\%\\_' OR 1=1%")
  expect(dialect.sqlToQuery(query.headlineSql.sql).sql).toContain('ts_headline')
})
test('short queries exclude content ILIKE and punctuation produces no tsquery', () => {
  expect(fulltextExpressions('ab').searchConditions).toHaveLength(3)
  expect(fulltextExpressions('abc').searchConditions).toHaveLength(4)
  expect(fulltextExpressions('!!').searchConditions).toHaveLength(2)
  expect(
    dialect.sqlToQuery(fulltextExpressions('!!').headlineSql.sql).sql,
  ).toContain('NULL')
})
