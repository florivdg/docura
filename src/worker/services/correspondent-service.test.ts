import { beforeEach, expect, test, vi } from 'vitest'
import { createDbStub } from '@/test/db-stub'

const stub = createDbStub()
vi.doMock('@/db', () => ({ db: stub.db }))
const { applyCorrespondent } =
  await import('@/worker/services/correspondent-service')

const telekom = { id: 'c1', name: 'Telekom' }

beforeEach(stub.reset)

test('keeps a manually assigned correspondent untouched', async () => {
  await applyCorrespondent({ id: 'd1', correspondentId: 'c0' }, 'Telekom')
  expect(stub.writes).toEqual([])
})

test('assigns an existing correspondent to an empty document', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  stub.results.push([telekom], [{ id: 'd1' }])
  await applyCorrespondent({ id: 'd1', correspondentId: null }, ' telekom ')
  expect(stub.writes).toEqual([{ correspondentId: 'c1' }])
  expect(log).toHaveBeenCalledWith(expect.stringContaining('zugewiesen'))
})

test('creates the correspondent and drops the suggestion if a value won', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  stub.results.push([], [telekom], [])
  await applyCorrespondent({ id: 'd1', correspondentId: null }, 'Telekom')
  expect(stub.writes).toEqual([{ name: 'Telekom' }, { correspondentId: 'c1' }])
  expect(log).toHaveBeenCalledWith(expect.stringContaining('verworfen'))
})

test('logs database failures instead of failing the pipeline', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  stub.results.push(new Error('connection lost'))
  await applyCorrespondent({ id: 'd1', correspondentId: null }, 'Telekom')
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('d1'),
    'connection lost',
  )
})
