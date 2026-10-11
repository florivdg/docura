import { drizzle } from 'drizzle-orm/bun-sql'

export const db = drizzle(process.env.DATABASE_URL!)

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
