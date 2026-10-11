import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import {
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from 'better-auth/api'
import { admin } from 'better-auth/plugins'
import { passkey } from '@better-auth/passkey'
import { db } from '@/db'
import * as schema from '@/db/schema'
import {
  coercedUserId,
  createUserPasswordError,
  ownRoleChangeError,
  roleChangeTarget,
} from '@/lib/admin-guard'
import { isSmtpConfigured, sendPasswordResetEmail } from '@/lib/email'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/password-policy'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    // Accounts are created by admins (user management page or `bun run user:add`);
    // the admin plugin's create-user endpoint is unaffected by this flag.
    disableSignUp: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    revokeSessionsOnPasswordReset: true,
    // Without SMTP Better Auth rejects reset requests with RESET_PASSWORD_DISABLED.
    sendResetPassword: isSmtpConfigured()
      ? ({ user, url }) => sendPasswordResetEmail(user, url)
      : undefined,
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL!],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const passwordError = createUserPasswordError(
        ctx.path,
        ctx.body,
        ctx.context.password.config,
      )
      if (passwordError) throw passwordError
      const target = roleChangeTarget(ctx.path, ctx.body)
      if (!target) return
      const session = await getSessionFromCtx(ctx)
      if (session?.user.id === target) throw ownRoleChangeError()
    }),
    after: createAuthMiddleware(async (ctx) => {
      // Like revokeSessionsOnPasswordReset: a password set by an admin ends
      // every session started with the old one.
      const { returned } = ctx.context
      if (ctx.path !== '/admin/set-user-password') return
      if (!returned || isAPIError(returned)) return
      const userId = coercedUserId(ctx.body)
      if (userId === null) return
      await ctx.context.internalAdapter.deleteUserSessions(userId)
    }),
  },
  plugins: [
    admin(),
    passkey({
      rpID: process.env.PASSKEY_RP_ID!,
      rpName: 'Docura',
      origin: process.env.PASSKEY_ORIGIN!,
    }),
  ],
})
