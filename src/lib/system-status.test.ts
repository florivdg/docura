import { expect, test } from 'vitest'
import {
  isModelListed,
  ollamaModelStatus,
  queueSummary,
  summarizeHeartbeat,
} from './system-status'

const ok = { status: 'ok', latencyMs: 1, error: null } as const
const heartbeat = {
  pid: 7,
  hostname: 'nas',
  concurrency: 2,
  startedAt: '2026-01-01T00:00:00.000Z',
  lastSeen: '2026-01-01T00:01:00.000Z',
  version: '0.0.1',
  embedModel: 'mxbai-embed-large',
  llmModel: 'llama3',
}

test('derives worker liveness from the heartbeat key', () => {
  expect(
    summarizeHeartbeat({ check: ok, value: JSON.stringify(heartbeat) }),
  ).toEqual({ ...heartbeat, status: 'ok' })
  expect(summarizeHeartbeat({ check: ok, value: null })).toEqual({
    status: 'down',
    lastSeen: null,
  })
  expect(summarizeHeartbeat({ check: ok, value: '{broken' }).status).toBe(
    'down',
  )
  expect(summarizeHeartbeat({ check: ok, value: 'null' }).status).toBe('down')
  const redisDown = { ...ok, status: 'error', error: 'x' } as const
  expect(summarizeHeartbeat({ check: redisDown, value: null }).status).toBe(
    'unknown',
  )
})

test('normalizes queue counts from Postgres', () => {
  const row = {
    pending: '2',
    processing: 1,
    failed: 3,
    failedRetrying: 1,
    oldestPendingAt: new Date('2026-01-01T00:00:00Z'),
  }
  expect(queueSummary(row)).toEqual({
    pending: 2,
    processing: 1,
    failed: 3,
    failedRetrying: 1,
    oldestPendingAt: '2026-01-01T00:00:00.000Z',
  })
  expect(queueSummary({ ...row, oldestPendingAt: null }).oldestPendingAt).toBe(
    null,
  )
})

test('matches configured models against the Ollama tag list', () => {
  expect(isModelListed('llama3', ['llama3:latest'])).toBe(true)
  expect(isModelListed('llama3:8b', ['llama3:latest'])).toBe(false)
  expect(isModelListed('llama3:8b', ['llama3:8b'])).toBe(true)
  const models = { embed: 'mxbai-embed-large', llm: 'llama3' }
  expect(
    ollamaModelStatus(
      { models: [{ name: 'mxbai-embed-large:latest' }, null, { name: 7 }] },
      models,
    ),
  ).toEqual({
    embed: { name: 'mxbai-embed-large', available: true },
    llm: { name: 'llama3', available: false },
  })
  expect(ollamaModelStatus({}, models).embed.available).toBe(false)
  expect(ollamaModelStatus(null, models).llm.available).toBeNull()
})
