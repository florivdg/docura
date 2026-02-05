#!/usr/bin/env bun
import { auth } from '@/lib/auth'
import { APIError } from 'better-auth/api'

async function main() {
  const [, , email, password, name] = process.argv

  if (!email || !password) {
    console.error('Usage: bun add-user.ts <email> <password> [name]')
    process.exit(1)
  }

  const MIN_PASSWORD_LENGTH = 16
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `Error: Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    )
    process.exit(1)
  }

  const displayName = name ?? email.split('@')[0]

  try {
    const result = await auth.api.createUser({
      body: {
        email,
        password,
        name: displayName,
        role: 'user',
      },
    })

    console.log('User created successfully:', result.user.email)
  } catch (error) {
    if (error instanceof APIError) {
      if (
        error.message.includes('email') ||
        error.message.includes('already exists')
      ) {
        console.error(`Error: A user with email "${email}" already exists`)
      } else {
        console.error('Error creating user:', error.message)
      }
    } else {
      console.error('Error creating user:', error)
    }
    process.exit(1)
  }
}

void main()
