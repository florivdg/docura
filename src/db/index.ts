import { drizzle } from 'drizzle-orm/bun-sql'
import { sql } from 'drizzle-orm'

export const db = drizzle(process.env.DATABASE_URL!)

await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`)
