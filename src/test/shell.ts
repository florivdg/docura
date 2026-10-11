import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tempDir } from './temp-dir'

const SHIMS: Record<string, string> = {
  pg_dump: `if [ "$1" = "--version" ]; then echo "pg_dump (PostgreSQL) 18.1"; exit 0; fi
[ -n "\${STUB_FAIL:-}" ] && exit 1
echo "pg_dump $*" >> "$STUB_LOG"
printf 'DUMP'`,
  pg_restore: `[ -n "\${STUB_FAIL:-}" ] && exit 1
echo "pg_restore $*" >> "$STUB_LOG"
cat > "$STUB_LOG.stdin"`,
  // STUB_TABLES: the non-empty tables the target check reports (unset = none).
  psql: `echo "psql $*" >> "$STUB_LOG"
echo "\${STUB_TABLES:-}"`,
  // docker exec [-i] <container> <command…>: logs and runs the command locally.
  docker: `echo "docker $*" >> "$STUB_LOG"
shift; [ "$1" = "-i" ] && shift; shift
exec "$@"`,
}

export interface ShellSandbox {
  root: string
  bin: string
  log: string
  uploads: string
  backups: string
}

/** A temp dir with stub pg_dump/pg_restore/psql/docker on PATH and empty uploads/backups. */
export function shellSandbox(): ShellSandbox {
  const root = tempDir('shell')
  const sandbox = {
    root,
    bin: join(root, 'bin'),
    log: join(root, 'stub.log'),
    uploads: join(root, 'uploads'),
    backups: join(root, 'backups'),
  }
  for (const dir of [sandbox.bin, sandbox.uploads]) mkdirSync(dir)
  for (const [name, body] of Object.entries(SHIMS))
    writeShim(sandbox, name, body)
  return sandbox
}

/** Adds (or replaces) a stub command, e.g. a failing `tar`. */
export function writeShim(sandbox: ShellSandbox, name: string, body: string) {
  const path = join(sandbox.bin, name)
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
}

/** Runs a bash script with the sandbox's stubs first on PATH. */
export function runScript(
  sandbox: ShellSandbox,
  script: string,
  args: string[] = [],
  env: Record<string, string | undefined> = {},
) {
  const merged = {
    PATH: `${sandbox.bin}:${process.env.PATH}`,
    HOME: sandbox.root,
    STUB_LOG: sandbox.log,
    DATABASE_URL: 'postgresql://docura:secret@localhost:5433/docura',
    UPLOAD_DIR: sandbox.uploads,
    BACKUP_DIR: sandbox.backups,
    ...env,
  }
  // An `undefined` entry removes the variable.
  const defined = Object.entries(merged).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  )
  // cwd: the scripts read ./.env, which must not be the project's.
  return spawnSync('bash', [script, ...args], {
    cwd: sandbox.root,
    encoding: 'utf8',
    env: Object.fromEntries(defined),
  })
}
