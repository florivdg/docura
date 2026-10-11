#!/usr/bin/env bun
import { auth } from '@/lib/auth'
import { runUserCli, setUserPasswordCommand } from '@/lib/user-cli'

process.exit(
  await runUserCli(setUserPasswordCommand, process.argv.slice(2), auth),
)
