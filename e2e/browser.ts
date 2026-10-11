import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from 'playwright'
import type { SmokeConfig } from './config'
import { check, SmokeError } from './helpers'

export interface SmokeBrowser {
  browser: Browser
  context: BrowserContext
  page: Page
  cdp: CDPSession
  authenticatorId: string
}

/**
 * Chromium with the real certificate chain (SMOKE_SPKI accepts the private
 * CA) and a virtual platform authenticator for the passkey steps.
 */
export async function launchBrowser(
  config: SmokeConfig,
): Promise<SmokeBrowser> {
  const args = config.spki
    ? [`--ignore-certificate-errors-spki-list=${config.spki}`]
    : []
  // No Playwright signal handlers: smoke.ts cleans up first, then closes.
  const browser = await chromium.launch({
    args,
    handleSIGINT: false,
    handleSIGTERM: false,
  })
  const context = await browser.newContext({
    baseURL: config.baseUrl,
    ignoreHTTPSErrors: config.ignoreHttpsErrors,
  })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send(
    'WebAuthn.addVirtualAuthenticator',
    {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  )
  return { browser, context, page, cdp, authenticatorId }
}

interface ApiResponse<T> {
  status: number
  body: T
}

/**
 * Calls the API from inside the page: the browser sends the session cookie
 * and the `Origin` header the CSRF check of mutating requests expects. The
 * request (including its body) is aborted after `timeoutMs`.
 */
export function api<T>(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<ApiResponse<T>> {
  // Plain, serializable init; it is passed into the page.
  const request: {
    method: string
    headers?: Record<string, string>
    body?: string
  } = { method: init.method ?? 'GET' }
  if (init.body !== undefined) {
    request.headers = { 'Content-Type': 'application/json' }
    request.body = JSON.stringify(init.body)
  }
  return page.evaluate(
    async ({ path, request, timeoutMs }) => {
      const signal = AbortSignal.timeout(timeoutMs)
      const res = await fetch(path, { ...request, signal })
      return { status: res.status, body: await res.json().catch(() => null) }
    },
    { path, request, timeoutMs: init.timeoutMs ?? 15_000 },
  )
}

const LEFT_LOGIN = (url: URL) => !url.pathname.startsWith('/login')

/**
 * Playwright's errors quote the call log, e.g. `fill("<password>")`; they are
 * replaced by a fixed message so the password never reaches the output.
 */
async function fillLoginForm(page: Page, config: SmokeConfig): Promise<void> {
  // Outside the redaction: goto's errors (TLS, DNS) name only the URL.
  await page.goto('/login')
  try {
    await page.fill('#email', config.email)
    await page.fill('#password', config.password)
    await page.click('button[type=submit]')
  } catch {
    throw new SmokeError(
      'Anmeldeformular konnte nicht ausgefüllt werden (Anmeldeseite prüfen)',
    )
  }
}

export async function passwordLogin(
  page: Page,
  config: SmokeConfig,
): Promise<void> {
  await fillLoginForm(page, config)
  await page.waitForURL(LEFT_LOGIN, { timeout: 15_000 }).catch(() => {
    check(false, 'Anmeldung fehlgeschlagen: SMOKE_EMAIL/SMOKE_PASSWORD prüfen')
  })
}

/**
 * Signs in through the "Mit Passkey anmelden" button. The button's ceremony
 * aborts the login page's pending conditional (autofill) request; should that
 * request have signed in first, the click fails on the departed page, which
 * counts as success.
 */
export async function passkeyLogin(page: Page): Promise<void> {
  await page.goto('/login')
  const signedIn = page.waitForURL(LEFT_LOGIN, { timeout: 15_000 })
  // The login form's conditional UI may sign in before the button is clicked;
  // whichever happens first wins, a failed click only matters if no sign-in follows.
  await Promise.race([
    signedIn,
    page
      .getByRole('button', { name: 'Mit Passkey anmelden' })
      .click({ timeout: 15_000 })
      .catch(() => {}),
  ])
  await signedIn
}

export async function sessionEmail(page: Page): Promise<string | undefined> {
  const { body } = await api<{ user?: { email?: string } } | null>(
    page,
    '/api/auth/get-session',
  )
  return body?.user?.email
}

/** Renders HTML in a throwaway page and passes that page to `capture`. */
async function render(
  context: BrowserContext,
  html: string,
  capture: (page: Page) => Promise<Buffer>,
): Promise<Buffer> {
  const page = await context.newPage()
  try {
    await page.setContent(html)
    return await capture(page)
  } finally {
    await page.close()
  }
}

/** A PNG screenshot of the HTML (an image the worker has to OCR). */
export function renderPng(
  context: BrowserContext,
  html: string,
): Promise<Buffer> {
  return render(context, html, async (page) => {
    await page.setViewportSize({ width: 1200, height: 600 })
    return page.screenshot({ type: 'png' })
  })
}

/** The HTML printed to an A4 PDF with a text layer (headless Chromium only). */
export function renderPdf(
  context: BrowserContext,
  html: string,
): Promise<Buffer> {
  return render(context, html, (page) => page.pdf({ format: 'A4' }))
}
