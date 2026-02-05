import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { passkey } from '@better-auth/passkey'
import { db } from '@/db'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL!],
  plugins: [
    passkey({
      rpID: process.env.PASSKEY_RP_ID!,
      rpName: 'Docura',
      origin: process.env.PASSKEY_ORIGIN!,
    }),
  ],
})
