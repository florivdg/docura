import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  passwordValidationError,
} from '@/lib/password-policy'
import { isUserRole, type UserRole } from '@/lib/roles'

/**
 * Logic behind the `user:*` maintenance scripts. The scripts only wire
 * `process.argv` and the Better Auth instance into `runUserCli`, so parsing,
 * validation and error reporting live here and are unit tested.
 */

class CliUsageError extends Error {}

interface CliUserRecord {
  id: string
  email: string
}

/** The subset of the Better Auth instance the CLI depends on. */
export interface UserCliAuth {
  api: {
    createUser(input: {
      body: { email: string; password: string; name: string; role: UserRole }
    }): Promise<{ user: { email: string } }>
  }
  $context: Promise<{
    internalAdapter: {
      findUserByEmail(email: string): Promise<{ user: CliUserRecord } | null>
      updateUser(userId: string, data: { role: UserRole }): Promise<unknown>
      findCredentialAccount(userId: string): Promise<unknown>
      updatePassword(userId: string, hash: string): Promise<void>
      createAccount(account: {
        userId: string
        providerId: string
        accountId: string
        password: string
      }): Promise<unknown>
      deleteUserSessions(userId: string): Promise<void>
    }
    password: { hash(password: string): Promise<string> }
  }>
}

interface UserCliCommand<T> {
  usage: string
  parse(args: string[]): T
  run(input: T, auth: UserCliAuth): Promise<string>
}

function splitArgs(args: string[], allowedFlags: string[] = []) {
  const flags = new Set<string>()
  const positionals: string[] = []
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      positionals.push(arg)
    } else if (allowedFlags.includes(arg)) {
      flags.add(arg)
    } else {
      throw new CliUsageError(`Unknown option "${arg}"`)
    }
  }
  return { flags, positionals }
}

function requirePositionals(positionals: string[], count: number) {
  const values = positionals.slice(0, count)
  if (values.length < count || values.some((value) => !value.trim())) {
    throw new CliUsageError('Missing arguments')
  }
  return values
}

function assertPassword(password: string) {
  if (passwordValidationError(password)) {
    throw new CliUsageError(
      `Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters long`,
    )
  }
}

async function findUserId(auth: UserCliAuth, email: string) {
  const ctx = await auth.$context
  const found = await ctx.internalAdapter.findUserByEmail(email.toLowerCase())
  if (!found) throw new Error(`No user with email "${email}" exists`)
  return { userId: found.user.id, ctx }
}

export const addUserCommand: UserCliCommand<{
  email: string
  password: string
  name: string
  role: UserRole
}> = {
  usage: 'bun run user:add <email> <password> [name] [--admin]',
  parse(args) {
    const { flags, positionals } = splitArgs(args, ['--admin'])
    const [email, password] = requirePositionals(positionals, 2)
    assertPassword(password)
    const name = positionals[2]?.trim() || email.split('@')[0]
    const role = flags.has('--admin') ? 'admin' : 'user'
    return { email, password, name, role }
  },
  async run(input, auth) {
    const { user } = await auth.api.createUser({ body: input })
    return `User created successfully: ${user.email} (role: ${input.role})`
  },
}

export const setUserRoleCommand: UserCliCommand<{
  email: string
  role: UserRole
}> = {
  usage: 'bun run user:role <email> <admin|user>',
  parse(args) {
    const [email, role] = requirePositionals(splitArgs(args).positionals, 2)
    if (!isUserRole(role)) {
      throw new CliUsageError(`Unknown role "${role}"`)
    }
    return { email, role }
  },
  async run({ email, role }, auth) {
    const { userId, ctx } = await findUserId(auth, email)
    await ctx.internalAdapter.updateUser(userId, { role })
    return `Role of ${email} set to ${role}`
  },
}

export const setUserPasswordCommand: UserCliCommand<{
  email: string
  password: string
}> = {
  usage: 'bun run user:password <email> <new-password>',
  parse(args) {
    const [email, password] = requirePositionals(splitArgs(args).positionals, 2)
    assertPassword(password)
    return { email, password }
  },
  async run({ email, password }, auth) {
    const { userId, ctx } = await findUserId(auth, email)
    const { internalAdapter } = ctx
    const hash = await ctx.password.hash(password)
    if (await internalAdapter.findCredentialAccount(userId)) {
      await internalAdapter.updatePassword(userId, hash)
    } else {
      await internalAdapter.createAccount({
        userId,
        providerId: 'credential',
        accountId: userId,
        password: hash,
      })
    }
    await internalAdapter.deleteUserSessions(userId)
    return `Password of ${email} updated; all sessions were revoked`
  },
}

function errorCode(error: unknown): string | undefined {
  const body = (error as { body?: { code?: unknown } } | null)?.body
  return typeof body?.code === 'string' ? body.code : undefined
}

function describeError(error: unknown, usage: string): string {
  if (error instanceof CliUsageError) {
    return `Error: ${error.message}\nUsage: ${usage}`
  }
  if (errorCode(error)?.startsWith('USER_ALREADY_EXISTS')) {
    return 'Error: A user with this email already exists'
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`
}

/** Runs a user command and returns the process exit code. */
export async function runUserCli<T>(
  command: UserCliCommand<T>,
  args: string[],
  auth: UserCliAuth,
): Promise<number> {
  try {
    console.log(await command.run(command.parse(args), auth))
    return 0
  } catch (error) {
    console.error(describeError(error, command.usage))
    return 1
  }
}
