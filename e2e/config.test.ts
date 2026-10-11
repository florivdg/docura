import { expect, test } from 'vitest'
import { readSmokeConfig, SmokeConfigError, USAGE } from './config'

const base = {
  SMOKE_BASE_URL: 'https://docura.localhost:8443/',
  SMOKE_EMAIL: ' admin@example.com ',
  SMOKE_PASSWORD: ' geheimes Passwort ',
}

test('reads the required settings with defaults', () => {
  expect(readSmokeConfig(base)).toEqual({
    baseUrl: 'https://docura.localhost:8443',
    email: 'admin@example.com',
    password: ' geheimes Passwort ',
    spki: undefined,
    ignoreHttpsErrors: false,
    processingTimeoutMs: 300_000,
  })
})

test('reads the optional settings', () => {
  const config = readSmokeConfig({
    ...base,
    SMOKE_SPKI: ' abc= ',
    SMOKE_TIMEOUT_SECONDS: '60',
  })
  expect(config.spki).toBe('abc=')
  expect(config.ignoreHttpsErrors).toBe(false)
  expect(config.processingTimeoutMs).toBe(60_000)
})

test('accepts any certificate only when asked to', () => {
  const config = readSmokeConfig({ ...base, SMOKE_IGNORE_HTTPS_ERRORS: '1' })
  expect(config.spki).toBeUndefined()
  expect(config.ignoreHttpsErrors).toBe(true)
  expect(
    readSmokeConfig({ ...base, SMOKE_IGNORE_HTTPS_ERRORS: 'true' })
      .ignoreHttpsErrors,
  ).toBe(false)
})

test('a blank SMOKE_SPKI does not conflict with SMOKE_IGNORE_HTTPS_ERRORS', () => {
  const config = readSmokeConfig({
    ...base,
    SMOKE_SPKI: '  ',
    SMOKE_IGNORE_HTTPS_ERRORS: '1',
  })
  expect(config.spki).toBeUndefined()
  expect(config.ignoreHttpsErrors).toBe(true)
})

test.each([
  [{}, 'SMOKE_BASE_URL ist nicht gesetzt.'],
  [{ ...base, SMOKE_EMAIL: '  ' }, 'SMOKE_EMAIL ist nicht gesetzt.'],
  [{ ...base, SMOKE_PASSWORD: undefined }, 'SMOKE_PASSWORD ist nicht gesetzt.'],
  [{ ...base, SMOKE_BASE_URL: 'docura' }, 'keine gültige URL'],
  [{ ...base, SMOKE_BASE_URL: 'ftp://docura' }, 'muss mit https://'],
  [{ ...base, SMOKE_TIMEOUT_SECONDS: '0' }, 'positive ganze Zahl'],
  [{ ...base, SMOKE_TIMEOUT_SECONDS: '1.5' }, 'positive ganze Zahl'],
  [
    { ...base, SMOKE_SPKI: 'abc=', SMOKE_IGNORE_HTTPS_ERRORS: '1' },
    'SMOKE_SPKI und SMOKE_IGNORE_HTTPS_ERRORS schließen sich aus',
  ],
])('rejects invalid settings', (env, message) => {
  expect(() => readSmokeConfig(env)).toThrow(SmokeConfigError)
  expect(() => readSmokeConfig(env)).toThrow(message)
})

test('documents every variable in the usage text', () => {
  for (const name of [
    'SMOKE_BASE_URL',
    'SMOKE_EMAIL',
    'SMOKE_PASSWORD',
    'SMOKE_SPKI',
    'SMOKE_IGNORE_HTTPS_ERRORS',
    'SMOKE_TIMEOUT_SECONDS',
  ])
    expect(USAGE).toContain(name)
})
