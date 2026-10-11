/**
 * Maps `items` through `fn` with at most `limit` calls in flight; the
 * results keep the order of `items`. The first rejection rejects the whole
 * call (calls already started still run to completion).
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R>({ length: items.length })
  let next = 0
  async function work() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workers }, work))
  return results
}
