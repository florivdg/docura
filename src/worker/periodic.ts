/** Waits `ms`, or less if `signal` aborts first; never rejects. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

/**
 * Runs `task` right away and then every `intervalMs` until `signal` aborts.
 * A failing run is logged and does not stop the loop.
 */
export async function runPeriodically(
  label: string,
  intervalMs: number,
  task: () => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await task()
    } catch (error) {
      console.error(`Fehler bei ${label}:`, error)
    }
    await abortableSleep(intervalMs, signal)
  }
}
