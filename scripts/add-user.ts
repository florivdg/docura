#!/usr/bin/env bun
import { auth } from '@/lib/auth'
import { addUserCommand, runUserCli } from '@/lib/user-cli'

process.exit(await runUserCli(addUserCommand, process.argv.slice(2), auth))
