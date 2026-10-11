/**
 * `fetch` that gives up after `timeoutMs`. An `options.signal` (e.g. a lost
 * job lease) cancels the request as well and rejects with its own reason.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  const caller = options.signal
  const signal = caller
    ? AbortSignal.any([controller.signal, caller])
    : controller.signal
  try {
    return await fetch(url, { ...options, signal })
  } catch (error) {
    caller?.throwIfAborted()
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Zeitüberschreitung nach ${timeoutMs}ms für ${url}`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
