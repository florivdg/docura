import { db } from '@/db'

/**
 * Runs a CLI script's `main`, closes the database pool and exits with the
 * code `main` resolves to; a thrown error is logged with `failureMessage`
 * and exits with `errorCode`.
 */
export async function runDbCli(
  main: () => Promise<number>,
  failureMessage: string,
  errorCode: number,
): Promise<void> {
  const exitCode = await main().catch((error: unknown) => {
    console.error(failureMessage, error)
    return errorCode
  })
  await db.$client.end().catch(() => {})
  process.exit(exitCode)
}
