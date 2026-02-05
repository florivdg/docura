import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
import { passkey } from '@better-auth/passkey'
import { db } from '@/db'
import * as schema from '@/db/schema'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL!],
  plugins: [
    admin(),
    passkey({
      rpID: process.env.PASSKEY_RP_ID!,
      rpName: 'Docura',
      origin: process.env.PASSKEY_ORIGIN!,
    }),
  ],
})
