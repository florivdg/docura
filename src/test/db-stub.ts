/**
 * A queued query adapter for route contract tests; no network or database
 * required. Queue an `Error` to make the next query reject with it.
 */
export function createDbStub() {
  const results: (unknown[] | Error)[] = []
  const writes: unknown[] = []
  function builder() {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      groupBy: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      for: () => chain,
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
        const next = results.shift() ?? []
        return (
          next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
        ).then(resolve, reject)
      },
    }
    return chain
  }
  const db = {
    select: builder,
    insert: builder,
    update: builder,
    delete: builder,
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
      callback(db),
  }
  /** Empties both queues; meant for `beforeEach(stub.reset)`. */
  function reset() {
    results.length = 0
    writes.length = 0
  }
  return { db, results, writes, reset }
}
