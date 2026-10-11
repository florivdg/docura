#!/usr/bin/env bun
/**
 * End-to-end smoke test against a running Docura instance (no mocks):
 * password and passkey login, upload, processing, search, trash, cleanup.
 * See README, "Smoke test". Exit code 0 = all steps passed, 1 = failure,
 * 130/143 = aborted by SIGINT/SIGTERM (after cleaning up).
 */
import type { Page, Response } from 'playwright'
import {
  api,
  launchBrowser,
  passkeyLogin,
  passwordLogin,
  renderPdf,
  renderPng,
  sessionUser,
  type SmokeBrowser,
} from './browser'
import {
  readSmokeConfig,
  SmokeConfigError,
  USAGE,
  type SmokeConfig,
} from './config'
import { createFixtures, type SmokeFixtures } from './fixtures'
import {
  check,
  checkNoFailures,
  cleanupComplete,
  errorMessage,
  leftoverLines,
  llmMetadataApplied,
  llmMetadataLine,
  missingActivity,
  newCorrespondents,
  poll,
  processingDone,
  progressLine,
  redactSecret,
  semanticRank,
  settleEach,
  SmokeError,
  uploadOutcome,
  withTimeout,
  type JobState,
  type ActivityLine,
  type Leftovers,
  type LlmMetadata,
  type UploadResult,
} from './helpers'

interface Run {
  config: SmokeConfig
  fixtures: SmokeFixtures
  browser: SmokeBrowser
  /** Uploaded test documents (name → id), removed again during cleanup. */
  documents: Map<string, string>
  /** Set before registering, so a failed run still removes the passkey. */
  passkeyRequested: boolean
  /** Set once the passkey's deletion is confirmed. */
  passkeyRemoved: boolean
  /** Upload responses still outstanding; those files may exist anyway. */
  pendingUploads: number
  /** Correspondent ids before the upload; unset = not reported. */
  preexistingCorrespondents?: Set<string>
  /** Correspondents of removed test documents (id → name), reported if new. */
  correspondentCandidates: Map<string, string>
  /** The one cleanup after a failure or an abort (memoized). */
  cleanup?: Promise<void>
  /** Exit code once SIGINT/SIGTERM arrived. */
  abortCode?: number
}

interface UploadFile {
  name: string
  mimeType: string
  buffer: Buffer
}

interface DocumentBody {
  document: LlmMetadata & {
    trashedAt: string | null
    textContent: string | null
    processingJobs: JobState[]
  }
}

interface SearchBody {
  results?: { id: string }[]
  error?: string
}

/** Number of top semantic results the PDF has to appear in. */
const SEMANTIC_TOP_N = 10

/** The error's message without the password (Playwright quotes its calls). */
function printableError(run: Run, error: unknown): string {
  return redactSecret(errorMessage(error), run.config.password)
}

/** Runs one step; a failure is rethrown with the step's number and title. */
async function step(
  run: Run,
  number: number,
  title: string,
  action: () => Promise<void>,
): Promise<void> {
  const started = Date.now()
  console.log(`[${number}] ${title} …`)
  try {
    await action()
  } catch (error) {
    throw new SmokeError(
      `Schritt ${number} „${title}“: ${printableError(run, error)}`,
      { cause: error },
    )
  }
  console.log(`    ok (${((Date.now() - started) / 1000).toFixed(1)} s)`)
}

function info(message: string): void {
  console.log(`    ${message}`)
}

function documentId(run: Run, name: string): string {
  const id = run.documents.get(name)
  check(id, `Dokument ${name} wurde nicht hochgeladen`)
  return id
}

async function loadDocument(
  page: Page,
  id: string,
): Promise<DocumentBody['document']> {
  const { status, body } = await api<DocumentBody>(page, `/api/documents/${id}`)
  check(status === 200, `Dokument ${id} nicht abrufbar (HTTP ${status})`)
  return body.document
}

// --- Login -----------------------------------------------------------------

async function loginWithPassword({ config, browser }: Run): Promise<void> {
  await passwordLogin(browser.page, config)
  const secure = await browser.page.evaluate(() => ({
    isSecureContext: window.isSecureContext,
    webAuthn: typeof window.PublicKeyCredential === 'function',
  }))
  check(secure.isSecureContext, 'Seite ist kein Secure Context (HTTPS prüfen)')
  check(secure.webAuthn, 'WebAuthn ist im Browser nicht verfügbar')
  info(`angemeldet als ${config.email}, Secure Context`)
}

async function registerPasskey(run: Run): Promise<void> {
  const { fixtures } = run
  const { page, cdp, authenticatorId } = run.browser
  await page.goto('/account')
  await page
    .getByPlaceholder('Name des Passkeys (optional)')
    .fill(fixtures.passkeyName)
  run.passkeyRequested = true
  await page.getByRole('button', { name: 'Passkey hinzufügen' }).click()
  await page
    .getByRole('cell', { name: fixtures.passkeyName })
    .waitFor({ timeout: 15_000 })
  const { credentials } = await cdp.send('WebAuthn.getCredentials', {
    authenticatorId,
  })
  check(
    credentials.length > 0,
    'Kein Passkey im virtuellen Authenticator gespeichert',
  )
  info(`Passkey „${fixtures.passkeyName}“ registriert`)
}

async function loginWithPasskey({ config, browser }: Run): Promise<void> {
  await browser.context.clearCookies()
  await passkeyLogin(browser.page)
  const email = (await sessionUser(browser.page))?.email
  check(
    email?.toLowerCase() === config.email.toLowerCase(),
    `Sitzung gehört nicht zu ${config.email} (angemeldet: ${email ?? 'niemand'})`,
  )
  info(`mit Passkey angemeldet als ${email}`)
}

// --- Upload and processing ---------------------------------------------------

async function testFiles(run: Run): Promise<UploadFile[]> {
  const { pdf, image } = run.fixtures
  const { context } = run.browser
  return [
    {
      name: pdf.name,
      mimeType: 'application/pdf',
      buffer: await renderPdf(context, pdf.html),
    },
    {
      name: image.name,
      mimeType: 'image/png',
      buffer: await renderPng(context, image.html),
    },
  ]
}

function isUploadResponse(response: Response): boolean {
  const request = response.request()
  return (
    request.method() === 'POST' &&
    request.url().endsWith('/api/documents/upload')
  )
}

async function uploadResult(response: Response): Promise<UploadResult> {
  const body: unknown = await response.json().catch(() => null)
  return uploadOutcome(response.status(), body)
}

/**
 * Registers every accepted file as its response arrives, so cleanup removes
 * it even if another response never comes. The listener stays attached: a
 * response arriving after the step's timeout still registers its document.
 */
function trackUploads(run: Run, rejected: string[]): Promise<void> {
  return new Promise<void>((resolve) => {
    run.browser.page.on('response', (response) => {
      if (!isUploadResponse(response)) return
      void uploadResult(response).then((result) => {
        if ('id' in result) run.documents.set(result.name, result.id)
        else rejected.push(result.error)
        run.pendingUploads -= 1
        if (run.pendingUploads === 0) resolve()
      })
    })
  })
}

/** Correspondents that exist before the upload are never reported as new. */
async function snapshotCorrespondents(run: Run): Promise<void> {
  const { status, body } = await api<{
    correspondents?: { id: string }[]
  } | null>(run.browser.page, '/api/correspondents')
  const correspondents = body?.correspondents
  if (status !== 200 || !Array.isArray(correspondents)) return
  run.preexistingCorrespondents = new Set(correspondents.map(({ id }) => id))
}

async function uploadDocuments(run: Run): Promise<void> {
  const { page } = run.browser
  const files = await testFiles(run)
  const rejected: string[] = []
  const answered = trackUploads(run, rejected)
  await page.goto('/documents')
  await snapshotCorrespondents(run)
  await page.getByRole('button', { name: 'Hochladen', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByText('Dateien hierher ziehen oder durchsuchen').click()
  run.pendingUploads = files.length
  await (await chooser).setFiles(files)
  await withTimeout(answered, 60_000, 'Antworten des Upload-Endpunkts')
  check(rejected.length === 0, `Upload abgelehnt: ${rejected.join('; ')}`)
  await page
    .getByText('Datei hochgeladen')
    .nth(files.length - 1)
    .waitFor()
  await page.keyboard.press('Escape')
  info(`hochgeladen: ${[...run.documents.keys()].join(', ')}`)
}

/** Undefined while unknown: a failed request counts as still running. */
async function latestJob(
  page: Page,
  id: string,
): Promise<JobState | undefined> {
  const response = await api<DocumentBody>(page, `/api/documents/${id}`).catch(
    () => null,
  )
  if (response?.status !== 200) return undefined
  return response.body.document.processingJobs[0]
}

/** Only a job that failed for good or the timeout end the wait early. */
async function waitForProcessing(run: Run): Promise<void> {
  const { page } = run.browser
  const ids = [...run.documents.values()]
  let lastProgress = ''
  await poll(
    async () => {
      const jobs = await Promise.all(ids.map((id) => latestJob(page, id)))
      const progress = progressLine(jobs)
      if (progress !== lastProgress) info(`Status: ${progress}`)
      lastProgress = progress
      return processingDone(jobs)
    },
    {
      timeoutMs: run.config.processingTimeoutMs,
      intervalMs: 3_000,
      what: 'Verarbeitung der Testdokumente (Worker, OCR und Ollama prüfen)',
    },
  )
}

/** A broken LLM model still completes the job; its metadata would be missing. */
async function checkLlmMetadata(run: Run): Promise<void> {
  const { pdf } = run.fixtures
  const doc = await loadDocument(run.browser.page, documentId(run, pdf.name))
  info(llmMetadataLine(doc))
  check(
    llmMetadataApplied(doc, pdf.name),
    'LLM-Analyse hat weder Titel noch Belegdatum oder Korrespondent gesetzt (OLLAMA_LLM_MODEL und Worker-Logs prüfen)',
  )
}

// --- Search ------------------------------------------------------------------

async function searchIds(
  page: Page,
  query: string,
  mode: string,
): Promise<string[]> {
  const params = new URLSearchParams({ q: query, mode, size: '100' })
  const { status, body } = await api<SearchBody>(
    page,
    `/api/documents/search?${params}`,
  )
  check(
    status === 200,
    `Suche (${mode}) fehlgeschlagen (HTTP ${status}): ${body?.error ?? ''}`,
  )
  return (body.results ?? []).map((result) => result.id)
}

async function searchPdf(run: Run): Promise<void> {
  const { pdf } = run.fixtures
  const ids = await searchIds(run.browser.page, pdf.token, 'fulltext')
  check(
    ids.includes(documentId(run, pdf.name)),
    `Volltextsuche nach ${pdf.token} findet das PDF nicht`,
  )
  info(`„${pdf.token}“ → PDF gefunden`)
}

async function ocrText(run: Run, id: string): Promise<string> {
  const { textContent } = await loadDocument(run.browser.page, id)
  return (textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** The token first; if OCR misread it, at least the common word must match. */
async function searchImage(run: Run): Promise<void> {
  const { image } = run.fixtures
  const id = documentId(run, image.name)
  if (
    (await searchIds(run.browser.page, image.token, 'fulltext')).includes(id)
  ) {
    info(`„${image.token}“ → Bild gefunden (OCR)`)
    return
  }
  info(`OCR-Text: „${await ocrText(run, id)}“`)
  info(`Token ${image.token} nicht erkannt, suche nach „${image.word}“`)
  const ids = await searchIds(run.browser.page, image.word, 'fulltext')
  check(
    ids.includes(id),
    `Volltextsuche findet das Bild weder über ${image.token} noch über „${image.word}“`,
  )
}

/** The run's image (Lieferschein) is the control: unrelated to the query. */
async function searchSemantic(run: Run): Promise<void> {
  const { pdf, image, semanticQuery } = run.fixtures
  info(`Anfrage „${semanticQuery}“, Kontrollbild ${image.name}`)
  const ids = await searchIds(run.browser.page, semanticQuery, 'semantic')
  const rank = semanticRank(
    ids,
    documentId(run, pdf.name),
    documentId(run, image.name),
    SEMANTIC_TOP_N,
  )
  info(`PDF auf Rang ${rank}, vor dem Kontrollbild`)
}

// --- Trash -------------------------------------------------------------------

async function isTrashed(page: Page, id: string): Promise<boolean> {
  return (await loadDocument(page, id)).trashedAt !== null
}

async function trashAndRestore(run: Run): Promise<void> {
  const { page } = run.browser
  const id = documentId(run, run.fixtures.pdf.name)
  // The row link (DocumentTableRow); the LLM may have renamed the document.
  const link = page.locator(`a[href="/documents/${id}"]`)

  await page.goto(`/documents/${id}`)
  await page.getByRole('button', { name: 'Löschen', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'In den Papierkorb' })
    .click()
  await page.waitForURL((url) => url.pathname === '/documents')
  check(
    await isTrashed(page, id),
    'Dokument wurde nicht in den Papierkorb verschoben',
  )
  await page.goto('/documents?view=trash')
  await link.waitFor()
  info('im Papierkorb sichtbar')

  await page.goto(`/documents/${id}`)
  await page.getByRole('button', { name: 'Wiederherstellen' }).click()
  await page
    .getByText('Dieses Dokument befindet sich im Papierkorb.')
    .waitFor({ state: 'hidden' })
  check(!(await isTrashed(page, id)), 'Dokument wurde nicht wiederhergestellt')
  await page.goto('/documents')
  await link.waitFor()
  info('wiederhergestellt und wieder in der Liste')
}

// --- Audit trail -------------------------------------------------------------

/** Upload, KI-Analyse, trash and restore are recorded, and the dashboard shows them. */
async function checkActivity(run: Run): Promise<void> {
  const { page } = run.browser
  const id = documentId(run, run.fixtures.pdf.name)
  const history = await api<{ entries: ActivityLine[] }>(
    page,
    `/api/documents/${id}/activity?size=100`,
  )
  check(
    history.status === 200,
    `Verlauf nicht abrufbar (HTTP ${history.status})`,
  )
  const missing = missingActivity(
    history.body.entries,
    (await sessionUser(page))?.name ?? '',
  )
  check(!missing, `Verlauf unvollständig, es fehlt: ${missing}`)
  const recent = await api<{ entries: { document: { id: string | null } }[] }>(
    page,
    '/api/activity?limit=50',
  )
  check(
    recent.body.entries.some((entry) => entry.document.id === id),
    'Letzte Aktivität auf dem Dashboard enthält das PDF nicht',
  )
  info(`${history.body.entries.length} Einträge im Verlauf, Dashboard aktuell`)
}

// --- Cleanup -----------------------------------------------------------------

async function deleteDocument(
  page: Page,
  path: string,
  accepted: number[],
): Promise<void> {
  const { status } = await api(page, path, { method: 'DELETE' })
  check(accepted.includes(status), `DELETE ${path}: HTTP ${status}`)
}

function rememberCorrespondent(run: Run, doc: LlmMetadata): void {
  const { correspondent } = doc
  if (correspondent)
    run.correspondentCandidates.set(correspondent.id, correspondent.name)
}

/** Trash first (if needed), then delete permanently; already gone is fine. */
async function removeDocument(run: Run, page: Page, id: string): Promise<void> {
  const path = `/api/documents/${id}`
  const { status, body } = await api<DocumentBody>(page, path)
  if (status === 404) return
  check(status === 200, `Dokument ${id} nicht abrufbar (HTTP ${status})`)
  rememberCorrespondent(run, body.document)
  if (!body.document.trashedAt) await deleteDocument(page, path, [200, 409])
  await deleteDocument(page, `${path}?permanent=true`, [200, 404])
  const after = await api(page, path)
  check(after.status === 404, `Testdokument ${id} ist noch vorhanden`)
}

/** Tries every document; `run.documents` keeps only those still there. */
async function removeDocuments(run: Run, page: Page): Promise<void> {
  const count = run.documents.size
  const failures = await settleEach([...run.documents], async ([name, id]) => {
    await removeDocument(run, page, id)
    run.documents.delete(name)
  })
  checkNoFailures(failures, 'Testdokumente nicht gelöscht')
  info(`${count} Testdokument(e) endgültig gelöscht`)
}

/**
 * Names of the correspondents the LLM created for the test documents; empty
 * without a snapshot. They are never deleted automatically: other documents
 * (also archived or trashed ones, or new uploads) may already use them.
 */
function createdCorrespondents(run: Run): string[] {
  const preexisting = run.preexistingCorrespondents
  if (!preexisting) return []
  return newCorrespondents(run.correspondentCandidates, preexisting)
}

function correspondentHint(names: string[]): string {
  return `Neu angelegte Korrespondenten (bei Bedarf unter /correspondents prüfen und löschen): ${names.join(', ')}`
}

async function reportNewCorrespondents(run: Run): Promise<void> {
  if (!run.preexistingCorrespondents) return
  const names = createdCorrespondents(run)
  info(
    names.length > 0
      ? correspondentHint(names)
      : 'keine neu angelegten Korrespondenten',
  )
}

async function deletePasskeyInUi(run: Run): Promise<void> {
  const { fixtures, browser } = run
  const { page } = browser
  await page.goto('/account')
  const cell = page.getByRole('cell', { name: fixtures.passkeyName })
  await page
    .getByRole('row')
    .filter({ has: cell })
    .getByRole('button', { name: 'Löschen' })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Löschen' })
    .click()
  await cell.waitFor({ state: 'detached' })
  run.passkeyRemoved = true
  info(`Passkey „${fixtures.passkeyName}“ gelöscht`)
}

function passkeyMayExist(run: Run): boolean {
  return run.passkeyRequested && !run.passkeyRemoved
}

async function runPasskeyIds(run: Run, page: Page): Promise<string[]> {
  const { status, body } = await api<{ id: string; name?: string }[] | null>(
    page,
    '/api/auth/passkey/list-user-passkeys',
  )
  check(status === 200, `Passkeys nicht abrufbar (HTTP ${status})`)
  check(Array.isArray(body), 'Passkey-Liste nicht lesbar')
  return body
    .filter((passkey) => passkey.name === run.fixtures.passkeyName)
    .map((passkey) => passkey.id)
}

async function deletePasskey(page: Page, id: string): Promise<void> {
  const { status } = await api(page, '/api/auth/passkey/delete-passkey', {
    method: 'POST',
    body: { id },
  })
  check(status === 200, `Passkey nicht gelöscht (HTTP ${status})`)
}

/** Fallback after a failure: removes the run's passkey through Better Auth. */
async function deletePasskeyViaApi(run: Run, page: Page): Promise<void> {
  if (!passkeyMayExist(run)) return
  for (const id of await runPasskeyIds(run, page)) await deletePasskey(page, id)
  check(
    (await runPasskeyIds(run, page)).length === 0,
    `Passkey „${run.fixtures.passkeyName}“ ist nach dem Löschen noch vorhanden`,
  )
  run.passkeyRemoved = true
}

/** After a failure the session may be gone (e.g. during the passkey step). */
async function ensureSession(run: Run, page: Page): Promise<void> {
  await page.goto('/')
  if (!(await sessionUser(page))?.email) await passwordLogin(page, run.config)
}

/** Independent attempts: one failing does not skip the other. */
const CLEANUP_TASKS: ((run: Run, page: Page) => Promise<void>)[] = [
  removeDocuments,
  deletePasskeyViaApi,
]

async function cleanupFailures(run: Run, page: Page): Promise<string[]> {
  try {
    await ensureSession(run, page)
  } catch (error) {
    return [`Anmeldung fehlgeschlagen: ${errorMessage(error)}`]
  }
  const failures = await settleEach(CLEANUP_TASKS, (task) => task(run, page))
  // Uploads registered while the first pass ran (late 201 responses).
  if (run.documents.size > 0)
    failures.push(...(await settleEach([removeDocuments], (t) => t(run, page))))
  return failures
}

function needsCleanup(run: Run): boolean {
  return (
    run.documents.size > 0 || passkeyMayExist(run) || run.pendingUploads > 0
  )
}

function leftovers(run: Run): Leftovers {
  const { pdf, image, passkeyName } = run.fixtures
  return {
    documentIds: [...run.documents.values()],
    passkeyName: passkeyMayExist(run) ? passkeyName : undefined,
    pendingUpload:
      run.pendingUploads > 0
        ? { files: [pdf.name, image.name], token: pdf.token }
        : undefined,
  }
}

function printLeftovers(run: Run, failures: string[]): void {
  const reasons = failures.map((failure) => printableError(run, failure))
  for (const line of leftoverLines(leftovers(run), reasons)) console.error(line)
}

/** Judged by what actually remains, not only by the reported failures. */
function cleanedUp(run: Run, failures: string[]): boolean {
  return cleanupComplete({
    failures,
    documentCount: run.documents.size,
    passkeyMayExist: passkeyMayExist(run),
    pendingUploads: run.pendingUploads,
  })
}

function reportCleanup(run: Run, failures: string[]): void {
  if (cleanedUp(run, failures)) console.error('Testdaten wurden aufgeräumt.')
  else printLeftovers(run, failures)
  const names = createdCorrespondents(run)
  if (names.length > 0) console.error(correspondentHint(names))
}

/** On a fresh page (same cookies), so it does not race a step in flight. */
async function cleanUp(run: Run): Promise<void> {
  if (!needsCleanup(run)) return
  const page = await run.browser.context.newPage()
  try {
    reportCleanup(run, await cleanupFailures(run, page))
  } finally {
    await page.close().catch(() => {})
  }
}

/** Failure path and signal handler share one cleanup. */
function cleanUpOnce(run: Run): Promise<void> {
  run.cleanup ??= cleanUp(run).catch((error: unknown) =>
    printLeftovers(run, [errorMessage(error)]),
  )
  return run.cleanup
}

// --- Main --------------------------------------------------------------------

const STEPS: [string, (run: Run) => Promise<void>][] = [
  ['Anmeldung mit Passwort', loginWithPassword],
  ['Passkey registrieren', registerPasskey],
  ['Anmeldung mit Passkey', loginWithPasskey],
  ['PDF und Bild über den Upload-Dialog hochladen', uploadDocuments],
  ['Auf die Verarbeitung warten', waitForProcessing],
  ['LLM-Metadaten des PDFs', checkLlmMetadata],
  ['Volltextsuche findet das PDF', searchPdf],
  ['Volltextsuche findet das Bild (OCR)', searchImage],
  ['Semantische Suche findet das PDF', searchSemantic],
  ['Papierkorb und Wiederherstellen', trashAndRestore],
  ['Verlauf des PDFs', checkActivity],
  [
    'Testdokumente endgültig löschen',
    (run) => removeDocuments(run, run.browser.page),
  ],
  ['Neu angelegte Korrespondenten melden', reportNewCorrespondents],
  ['Passkey löschen', deletePasskeyInUi],
]

async function runSteps(run: Run): Promise<void> {
  for (const [index, [title, action]] of STEPS.entries()) {
    if (run.abortCode !== undefined) throw new SmokeError('Abgebrochen')
    await step(run, index + 1, title, () => action(run))
  }
}

function readConfigOrExit(): SmokeConfig {
  try {
    return readSmokeConfig(process.env)
  } catch (error) {
    if (!(error instanceof SmokeConfigError)) throw error
    console.error(`Fehler: ${error.message}\n\n${USAGE}`)
    process.exit(1)
  }
}

const EXIT_CODES = { SIGINT: 130, SIGTERM: 143 } as const

/** First signal: clean up, close, exit. A second one exits immediately. */
function abort(run: Run, signal: keyof typeof EXIT_CODES): void {
  const code = EXIT_CODES[signal]
  if (run.abortCode !== undefined) process.exit(code)
  run.abortCode = code
  console.error('\nAbgebrochen – räume Testdaten auf …')
  // Closing the page cancels the running step and its upload listener.
  void run.browser.page
    .close()
    .catch(() => {})
    .then(() => cleanUpOnce(run))
    .then(() => run.browser.browser.close())
    .catch(() => {})
    .finally(() => process.exit(code))
}

/** Installs the abort handlers; returns their removal. */
function handleSignals(run: Run): () => void {
  const onSigint = () => abort(run, 'SIGINT')
  const onSigterm = () => abort(run, 'SIGTERM')
  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)
  return () => {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
  }
}

async function runAll(run: Run): Promise<number> {
  try {
    await runSteps(run)
    console.log('\nSmoke-Test erfolgreich.')
    return 0
  } catch (error) {
    if (run.abortCode === undefined)
      console.error(`\nFEHLGESCHLAGEN: ${printableError(run, error)}`)
    await cleanUpOnce(run)
    return run.abortCode ?? 1
  }
}

async function startBrowser(config: SmokeConfig): Promise<SmokeBrowser | null> {
  try {
    return await launchBrowser(config)
  } catch (error) {
    console.error(
      `Chromium konnte nicht gestartet werden (bunx playwright install chromium?): ${errorMessage(error)}`,
    )
    return null
  }
}

async function main(): Promise<number> {
  const config = readConfigOrExit()
  const fixtures = createFixtures()
  console.log(
    `Docura-Smoke-Test gegen ${config.baseUrl} (Lauf ${fixtures.runId})`,
  )
  const browser = await startBrowser(config)
  if (!browser) return 1
  const run: Run = {
    config,
    fixtures,
    browser,
    documents: new Map(),
    passkeyRequested: false,
    passkeyRemoved: false,
    pendingUploads: 0,
    correspondentCandidates: new Map(),
  }
  const removeSignalHandlers = handleSignals(run)
  try {
    return await runAll(run)
  } finally {
    removeSignalHandlers()
    await browser.browser.close()
  }
}

process.exit(await main())
