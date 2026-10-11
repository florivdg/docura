/** A failed check; its message is printed as the reason of the failed step. */
export class SmokeError extends Error {}

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SmokeError(message)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Replaces the secret, raw and JSON-escaped (as in call logs), with `***`. */
export function redactSecret(message: string, secret: string): string {
  if (!secret) return message
  const escaped = JSON.stringify(secret).slice(1, -1)
  return message.replaceAll(secret, '***').replaceAll(escaped, '***')
}

/** Throws one error listing every failure, if there are any. */
export function checkNoFailures(failures: string[], what: string): void {
  check(failures.length === 0, `${what}: ${failures.join('; ')}`)
}

/**
 * Runs `action` for every item, also after earlier items failed, and returns
 * the failure messages (empty when all succeeded).
 */
export async function settleEach<T>(
  items: Iterable<T>,
  action: (item: T) => Promise<void>,
): Promise<string[]> {
  const failures: string[] = []
  for (const item of items) {
    try {
      await action(item)
    } catch (error) {
      failures.push(errorMessage(error))
    }
  }
  return failures
}

interface PollOptions {
  timeoutMs: number
  intervalMs: number
  /** What is awaited, for the timeout message. */
  what: string
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

function timeoutError(timeoutMs: number, what: string): SmokeError {
  return new SmokeError(
    `Zeitüberschreitung nach ${Math.round(timeoutMs / 1000)} s: ${what}`,
  )
}

/** Rejects with `error()` unless `promise` settles within `ms`. */
async function raceDeadline<T>(
  promise: Promise<T>,
  ms: number,
  error: () => SmokeError,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(error()), ms)
  })
  try {
    return await Promise.race([promise, expired])
  } finally {
    clearTimeout(timer)
  }
}

/** Rejects with a timeout error unless `promise` settles in time. */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  what: string,
): Promise<T> {
  return raceDeadline(promise, timeoutMs, () => timeoutError(timeoutMs, what))
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Calls `probe` until it returns a value other than `undefined` or the
 * timeout expires. Errors thrown by `probe` end the polling immediately; a
 * probe that never settles is cut off at the deadline.
 */
export async function poll<T>(
  probe: () => Promise<T | undefined>,
  {
    timeoutMs,
    intervalMs,
    what,
    sleep = defaultSleep,
    now = Date.now,
  }: PollOptions,
): Promise<T> {
  const deadline = now() + timeoutMs
  for (;;) {
    const remaining = Math.max(deadline - now(), 1)
    const value = await raceDeadline(probe(), remaining, () =>
      timeoutError(timeoutMs, what),
    )
    if (value !== undefined) return value
    if (now() >= deadline) throw timeoutError(timeoutMs, what)
    await sleep(intervalMs)
  }
}

/** The latest processing job of a document, as `/api/documents/:id` returns it. */
export interface JobState {
  status: string
  step: string | null
  errorMessage: string | null
  attempts: number
  maxAttempts: number
}

/**
 * A failed job is only final once its retries are used up; an unknown job
 * (none yet, or its status could not be read) counts as running.
 */
export function jobOutcome(
  job: JobState | undefined,
): 'completed' | 'failed' | 'running' {
  if (job?.status === 'completed') return 'completed'
  if (job?.status === 'failed' && job.attempts >= job.maxAttempts)
    return 'failed'
  return 'running'
}

/** All jobs completed → true; still running → undefined; final failure throws. */
export function processingDone(
  jobs: (JobState | undefined)[],
): true | undefined {
  const outcomes = jobs.map(jobOutcome)
  const failed = jobs[outcomes.indexOf('failed')]
  check(
    !failed,
    `Verarbeitung fehlgeschlagen: ${failed?.errorMessage ?? 'ohne Meldung'}`,
  )
  return outcomes.every((outcome) => outcome === 'completed') ? true : undefined
}

/** Status of each job, e.g. `processing/ocr, completed`. */
export function progressLine(jobs: (JobState | undefined)[]): string {
  return jobs
    .map((job) =>
      [job?.status ?? 'unbekannt', job?.step].filter(Boolean).join('/'),
    )
    .join(', ')
}

export type UploadResult = { id: string; name: string } | { error: string }

/** The created document of an upload response, or why it was rejected. */
export function uploadOutcome(status: number, body: unknown): UploadResult {
  const parsed = body as {
    document?: { id: string; name: string }
    error?: string
  } | null
  if (status === 201 && parsed?.document) return parsed.document
  return { error: `HTTP ${status}: ${parsed?.error ?? 'unbekannter Fehler'}` }
}

/**
 * 1-based rank of the target among the semantic results. It has to be among
 * the first `topN` and ahead of the control (an unrelated document of the
 * same run); a control missing from the results does not count against it.
 */
export function semanticRank(
  ids: string[],
  targetId: string,
  controlId: string,
  topN: number,
): number {
  const rank = ids.indexOf(targetId) + 1
  check(
    rank > 0 && rank <= topN,
    `PDF nicht unter den ersten ${topN} Treffern (Rang ${rank || '–'})`,
  )
  const controlRank = ids.indexOf(controlId) + 1
  check(
    controlRank === 0 || rank < controlRank,
    `PDF (Rang ${rank}) nicht vor dem Kontrollbild dieses Laufs (Rang ${controlRank})`,
  )
  return rank
}

/** The LLM-derived fields of `/api/documents/:id`. */
export interface LlmMetadata {
  name: string
  documentDate: string | null
  correspondent: { id: string; name: string } | null
}

/** True once the LLM analysis renamed the document or set date or correspondent. */
export function llmMetadataApplied(
  doc: LlmMetadata,
  uploadedName: string,
): boolean {
  return (
    doc.name !== uploadedName ||
    doc.documentDate !== null ||
    doc.correspondent !== null
  )
}

/** Title, correspondent and Belegdatum, `–` for what is missing. */
export function llmMetadataLine(doc: LlmMetadata): string {
  return `Titel „${doc.name}“, Korrespondent ${doc.correspondent?.name ?? '–'}, Belegdatum ${doc.documentDate ?? '–'}`
}

/**
 * Names of the correspondents assigned to the test documents that did not
 * exist before the upload (not in the snapshot), for the manual review hint.
 */
export function newCorrespondents(
  candidates: ReadonlyMap<string, string>,
  preexisting: ReadonlySet<string>,
): string[] {
  return [...candidates]
    .filter(([id]) => !preexisting.has(id))
    .map(([, name]) => name)
}

/** The cleanup's verdict, from what actually remains after it. */
export function cleanupComplete(state: {
  failures: string[]
  documentCount: number
  passkeyMayExist: boolean
  pendingUploads: number
}): boolean {
  return (
    state.failures.length === 0 &&
    state.documentCount === 0 &&
    !state.passkeyMayExist &&
    state.pendingUploads <= 0
  )
}

/** What a failed cleanup left behind, for the manual removal hint. */
export interface Leftovers {
  documentIds: string[]
  /** Set while the run's passkey may still exist. */
  passkeyName?: string
  /** Set while upload responses are missing: those files may exist anyway. */
  pendingUpload?: { files: string[]; token: string }
}

export function leftoverLines(
  leftovers: Leftovers,
  reasons: string[],
): string[] {
  const { documentIds, passkeyName, pendingUpload } = leftovers
  const items = [`Dokumente ${documentIds.join(', ') || 'keine'}`]
  if (passkeyName) items.push(`Passkey „${passkeyName}“`)
  const lines = [
    `Aufräumen unvollständig: ${reasons.join('; ') || 'Upload-Antworten fehlen'}`,
    `Bitte manuell löschen: ${items.join('; ')}.`,
  ]
  if (pendingUpload)
    lines.push(
      `Ein Upload wurde eventuell trotzdem angenommen: in der Bibliothek nach ${pendingUpload.files.join(' / ')} oder ${pendingUpload.token} suchen.`,
    )
  return lines
}
