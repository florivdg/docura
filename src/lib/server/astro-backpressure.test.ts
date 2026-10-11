// @vitest-environment node
import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { writeResponse } from 'astro/app/node'
import { expect, test } from 'vitest'

/**
 * Guards `patches/astro@*.patch`: the Node adapter must stop pulling the
 * response body while the socket buffer is full and continue on `drain`.
 * Without the patch a slow client of a large export or file buffers the
 * whole body in server memory. Fails when an Astro upgrade drops the patch.
 */
class StalledResponse extends EventEmitter {
  destroyed = false
  statusMessage = ''
  req = undefined
  chunks: Uint8Array[] = []
  ended = false

  writeHead() {
    return this
  }

  /** The socket buffer is always full: every write asks to wait for drain. */
  write(chunk: Uint8Array) {
    this.chunks.push(chunk)
    return false
  }

  end() {
    this.ended = true
    return this
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10))

/** Fails instead of hanging when writeResponse never settles. */
const withinTimeout = (done: Promise<unknown>) =>
  Promise.race([
    done,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('writeResponse hangs')), 500),
    ),
  ])

function countingBody(total: number) {
  const state = { pulls: 0, cancelled: false }
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        state.pulls++
        if (state.pulls > total) controller.close()
        else controller.enqueue(new Uint8Array([state.pulls]))
      },
      cancel() {
        state.cancelled = true
      },
    },
    // Pull only on demand, so the pull count shows what the adapter read.
    { highWaterMark: 0 },
  )
  return { body, state }
}

test('waits for drain before pulling the next chunk', async () => {
  const { body, state } = countingBody(3)
  const destination = new StalledResponse()
  const done = writeResponse(
    new Response(body),
    destination as unknown as ServerResponse,
  )
  await tick()
  expect(state.pulls).toBe(1)
  expect(destination.chunks).toHaveLength(1)
  await tick()
  expect(state.pulls).toBe(1)

  destination.emit('drain')
  await tick()
  expect(state.pulls).toBe(2)
  destination.emit('drain')
  await tick()
  destination.emit('drain')
  await done
  expect(destination.chunks).toHaveLength(3)
  expect(destination.ended).toBe(true)
})

test('stops reading when the client disconnects while waiting', async () => {
  const { body, state } = countingBody(100)
  const destination = new StalledResponse()
  const done = writeResponse(
    new Response(body),
    destination as unknown as ServerResponse,
  )
  await tick()
  destination.destroyed = true
  destination.emit('close')
  await done
  expect(state.pulls).toBe(1)
})

test('releases the body when the client disconnected before streaming', async () => {
  const { body, state } = countingBody(100)
  const destination = new StalledResponse()
  // 'close' already fired before writeResponse attached its listeners.
  destination.destroyed = true
  const done = writeResponse(
    new Response(body),
    destination as unknown as ServerResponse,
  )
  await withinTimeout(done)
  expect(state.pulls).toBeLessThanOrEqual(1)
  expect(state.cancelled).toBe(true)
})

test('releases a body whose first chunk is still pending when the client is gone', async () => {
  let cancelled = false
  // pull never enqueues: the first read would wait forever.
  const body = new ReadableStream<Uint8Array>(
    {
      pull: () => new Promise<void>(() => {}),
      cancel() {
        cancelled = true
      },
    },
    { highWaterMark: 0 },
  )
  const destination = new StalledResponse()
  destination.destroyed = true
  await withinTimeout(
    writeResponse(new Response(body), destination as unknown as ServerResponse),
  )
  expect(cancelled).toBe(true)
})

test('does not wait for a slow producer cleanup after the client left', async () => {
  let cancelRequested = false
  let pulls = 0
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        controller.enqueue(new Uint8Array([++pulls]))
      },
      // Cleanup that never finishes must not block the response.
      cancel() {
        cancelRequested = true
        return new Promise<void>(() => {})
      },
    },
    { highWaterMark: 0 },
  )
  const destination = new StalledResponse()
  const done = writeResponse(
    new Response(body),
    destination as unknown as ServerResponse,
  )
  await tick()
  // Destroyed while waiting for drain, without a 'close' that would make
  // Astro's own listener cancel first: only the loop exit cancels the body.
  destination.destroyed = true
  destination.emit('drain')
  await withinTimeout(done)
  expect(cancelRequested).toBe(true)
  expect(pulls).toBeLessThanOrEqual(2)
})
