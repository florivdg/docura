import { beforeEach, expect, test, vi } from 'vitest'
const redis = vi.hoisted(() => ({ set: vi.fn(), del: vi.fn() }))
const WORKER_HEARTBEAT_KEY = 'docura:worker:heartbeat'
vi.mock('@/lib/redis', () => ({
  sharedRedis: () => redis,
  WORKER_HEARTBEAT_KEY,
}))
const heartbeat = await import('./heartbeat')

beforeEach(() => {
  redis.set.mockReset()
  redis.del.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

test('describes the running worker', () => {
  const identity = heartbeat.workerIdentity(4)
  expect(identity).toMatchObject({
    pid: process.pid,
    concurrency: 4,
    version: expect.any(String),
    embedModel: expect.any(String),
    llmModel: expect.any(String),
  })
  expect(identity.hostname).toBeTruthy()
})

test('publishes the heartbeat with a TTL and warns once while Redis is down', async () => {
  const identity = heartbeat.workerIdentity(2)
  await heartbeat.publishWorkerHeartbeat(identity)
  const [key, value, mode, ttl] = redis.set.mock.calls[0]
  expect([key, mode, ttl]).toEqual([WORKER_HEARTBEAT_KEY, 'EX', 30])
  expect(JSON.parse(value)).toMatchObject({
    ...identity,
    lastSeen: expect.any(String),
  })
  redis.set.mockRejectedValue(new Error('offline'))
  await heartbeat.publishWorkerHeartbeat(identity)
  await heartbeat.publishWorkerHeartbeat(identity)
  expect(console.warn).toHaveBeenCalledTimes(1)
  redis.set.mockResolvedValue('OK')
  await heartbeat.publishWorkerHeartbeat(identity)
  redis.set.mockRejectedValue(new Error('offline'))
  await heartbeat.publishWorkerHeartbeat(identity)
  expect(console.warn).toHaveBeenCalledTimes(2)
})

test('removes the liveness key on shutdown', async () => {
  await heartbeat.clearWorkerHeartbeat()
  expect(redis.del).toHaveBeenCalledWith(WORKER_HEARTBEAT_KEY)
  redis.del.mockRejectedValue(new Error('offline'))
  await expect(heartbeat.clearWorkerHeartbeat()).resolves.toBeUndefined()
})
