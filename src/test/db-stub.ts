/**
 * A queued query adapter for route contract tests; no network or database
 * required. Queue an `Error` to make the next query reject with it.
 * `queries` logs the kind of every executed (awaited) query in order.
 */
export function createDbStub() {
  const results: (unknown[] | Error)[] = []
  const writes: unknown[] = []
  const queries: string[] = []
  function builder(kind: string) {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      groupBy: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      $dynamic: () => chain,
      for: (strength: string) => {
        kind = `${kind} for ${strength}`
        return chain
      },
      onConflictDoNothing: () => chain,
      returning: () => chain,
      as: () => ({ documentId: undefined, maxCreatedAt: undefined }),
      values: (value: unknown) => {
        writes.push(value)
        return chain
      },
      set: (value: unknown) => {
        writes.push(value)
        return chain
      },
      // oxlint-disable-next-line unicorn/no-thenable -- Drizzle query builders are deliberately lazy thenables.
      then: (
        resolve: (value: unknown[]) => unknown,
        reject: (reason: unknown) => unknown,
      ) => {
        queries.push(kind)
        const next = results.shift() ?? []
        return (
          next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
        ).then(resolve, reject)
      },
    }
    return chain
  }
  const db = {
    execute: (_query?: unknown) => builder('execute'),
    select: (_fields?: unknown) => builder('select'),
    insert: (_table?: unknown) => builder('insert'),
    update: (_table?: unknown) => builder('update'),
    delete: (_table?: unknown) => builder('delete'),
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
      callback(db),
  }
  /** Empties all queues; meant for `beforeEach(stub.reset)`. */
  function reset() {
    results.length = 0
    writes.length = 0
    queries.length = 0
  }
  return { db, results, writes, queries, reset }
}
