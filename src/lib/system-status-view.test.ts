import { expect, test } from 'vitest'
import type { SystemStatus } from './system-status'
import { serviceCards } from './system-status-view'

const ok = { status: 'ok', latencyMs: 3, error: null } as const
const down = {
  status: 'error',
  latencyMs: null,
  error: 'Zeitüberschreitung',
} as const

function status(overrides: Partial<SystemStatus> = {}): SystemStatus {
  return {
    checkedAt: '2026-01-01T00:00:00.000Z',
    worker: {
      status: 'ok',
      lastSeen: '2026-01-01T00:00:00.000Z',
      startedAt: '2026-01-01T00:00:00.000Z',
      hostname: 'nas',
      pid: 42,
      concurrency: 2,
      version: '0.0.1',
    },
    services: {
      database: ok,
      redis: ok,
      ocr: down,
      ollama: {
        ...ok,
        models: {
          embed: { name: 'mxbai-embed-large', available: true },
          llm: { name: 'llama3', available: false },
        },
      },
    },
    queue: null,
    ...overrides,
  }
}

test('builds one card per service with German labels', () => {
  const cards = serviceCards(status())
  expect(cards.map((c) => [c.key, c.state, c.label])).toEqual([
    ['worker', 'ok', 'Aktiv'],
    ['database', 'ok', 'Erreichbar'],
    ['redis', 'ok', 'Erreichbar'],
    ['ocr', 'error', 'Gestört'],
    ['ollama', 'warning', 'Modell fehlt'],
  ])
  expect(cards[0].details).toContain('Host: nas (PID 42)')
  expect(cards[1].details).toEqual(['Antwortzeit: 3 ms'])
  expect(cards[3].details).toEqual(['Zeitüberschreitung'])
  expect(cards[4].details).toEqual([
    'Antwortzeit: 3 ms',
    'Einbettungsmodell: mxbai-embed-large (installiert)',
    'Sprachmodell: llama3 (nicht installiert)',
  ])
})

test('explains a stopped worker and an unknown worker state', () => {
  const stopped = serviceCards(
    status({ worker: { status: 'down', lastSeen: null } }),
  )[0]
  expect(stopped).toMatchObject({ state: 'error', label: 'Nicht aktiv' })
  expect(stopped.details[0]).toContain('bun run worker')
  const unknown = serviceCards(
    status({ worker: { status: 'unknown', lastSeen: null } }),
  )[0]
  expect(unknown).toMatchObject({ state: 'unknown', label: 'Unbekannt' })
})

test('lists models without availability when Ollama is unreachable', () => {
  const base = status()
  const ollama = {
    ...down,
    error: null,
    models: {
      embed: { name: 'mxbai-embed-large', available: null },
      llm: { name: 'llama3', available: null },
    },
  }
  const card = serviceCards({
    ...base,
    services: { ...base.services, ollama },
  })[4]
  expect(card).toMatchObject({ state: 'error', label: 'Gestört' })
  expect(card.details).toEqual([
    'Nicht erreichbar',
    'Einbettungsmodell: mxbai-embed-large',
    'Sprachmodell: llama3',
  ])
})
