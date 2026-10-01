/** A queued query adapter for route contract tests; no network or database required. */
export function createDbStub() {
  const results: unknown[][] = []
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
      then: (resolve: (value: unknown[]) => unknown) =>
        Promise.resolve(results.shift() ?? []).then(resolve),
    }
    return chain
  }
  const db = {
    select: builder,
    insert: builder,
    update: builder,
    delete: builder,
    transaction: async (callback: (tx: unknown) => Promise<void>) =>
      callback(db),
  }
  return { db, results, writes }
}
