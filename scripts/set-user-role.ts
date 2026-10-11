#!/usr/bin/env bun
import { auth } from '@/lib/auth'
import { runUserCli, setUserRoleCommand } from '@/lib/user-cli'

process.exit(await runUserCli(setUserRoleCommand, process.argv.slice(2), auth))
