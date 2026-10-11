/** Smoke test settings, read from the environment (see README, "Smoke test"). */
export interface SmokeConfig {
  /** Origin of the running instance, e.g. https://docura.lan */
  baseUrl: string
  email: string
  password: string
  /** Chromium `--ignore-certificate-errors-spki-list` value (private CA). */
  spki?: string
  ignoreHttpsErrors: boolean
  processingTimeoutMs: number
}

export const USAGE = `Docura-Smoke-Test gegen eine laufende Instanz (Details: README, „Smoke test“).

  SMOKE_BASE_URL=https://docura.lan SMOKE_EMAIL=… SMOKE_PASSWORD=… bun run e2e:smoke

Erforderlich: SMOKE_BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD
Optional:     SMOKE_SPKI (private CA von Caddy) oder SMOKE_IGNORE_HTTPS_ERRORS=1,
              SMOKE_TIMEOUT_SECONDS (Standard 300)`

const DEFAULT_TIMEOUT_SECONDS = 300

export class SmokeConfigError extends Error {}

type Env = Record<string, string | undefined>

/** The raw value; passwords may legitimately start or end with spaces. */
function required(env: Env, name: string): string {
  const value = env[name]
  if (!value?.trim()) throw new SmokeConfigError(`${name} ist nicht gesetzt.`)
  return value
}

function readBaseUrl(env: Env): string {
  const raw = required(env, 'SMOKE_BASE_URL').trim()
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SmokeConfigError(`SMOKE_BASE_URL ist keine gültige URL: ${raw}`)
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new SmokeConfigError(
      'SMOKE_BASE_URL muss mit https:// oder http:// beginnen',
    )
  return url.origin
}

function readTimeoutMs(env: Env): number {
  const raw = env.SMOKE_TIMEOUT_SECONDS?.trim()
  if (!raw) return DEFAULT_TIMEOUT_SECONDS * 1000
  const seconds = Number(raw)
  if (!Number.isInteger(seconds) || seconds <= 0)
    throw new SmokeConfigError(
      `SMOKE_TIMEOUT_SECONDS muss eine positive ganze Zahl sein: ${raw}`,
    )
  return seconds * 1000
}

/** Either the pinned CA or "accept any certificate", never both. */
function readCertificateSettings(
  env: Env,
): Pick<SmokeConfig, 'spki' | 'ignoreHttpsErrors'> {
  const spki = env.SMOKE_SPKI?.trim() || undefined
  const ignoreHttpsErrors = env.SMOKE_IGNORE_HTTPS_ERRORS === '1'
  if (spki && ignoreHttpsErrors)
    throw new SmokeConfigError(
      'SMOKE_SPKI und SMOKE_IGNORE_HTTPS_ERRORS schließen sich aus; SMOKE_IGNORE_HTTPS_ERRORS entfernen.',
    )
  return { spki, ignoreHttpsErrors }
}

export function readSmokeConfig(env: Env): SmokeConfig {
  return {
    baseUrl: readBaseUrl(env),
    email: required(env, 'SMOKE_EMAIL').trim(),
    password: required(env, 'SMOKE_PASSWORD'),
    ...readCertificateSettings(env),
    processingTimeoutMs: readTimeoutMs(env),
  }
}
