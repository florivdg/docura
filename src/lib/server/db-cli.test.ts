import { beforeEach, expect, test, vi } from 'vitest'

const end = vi.fn(async () => {})
vi.doMock('@/db', () => ({ db: { $client: { end } } }))
const { runDbCli } = await import('./db-cli')

let exit: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  end.mockClear()
  exit = vi
    .spyOn(process, 'exit')
    .mockImplementation((() => undefined) as never)
})

test('exits with the code of main after closing the database', async () => {
  await runDbCli(async () => 1, 'Fehlgeschlagen:', 2)
  expect(end).toHaveBeenCalledOnce()
  expect(exit).toHaveBeenCalledWith(1)
})

test('logs a failure and exits with the error code', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  end.mockRejectedValueOnce(new Error('closed'))
  await runDbCli(
    async () => {
      throw new Error('kaputt')
    },
    'Fehlgeschlagen:',
    2,
  )
  expect(log).toHaveBeenCalledWith('Fehlgeschlagen:', expect.any(Error))
  expect(exit).toHaveBeenCalledWith(2)
})
