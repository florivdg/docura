// @vitest-environment node
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { runScript, shellSandbox, writeShim } from '@/test/shell'

const BACKUP = join(import.meta.dirname, 'backup.sh')
const RESTORE = join(import.meta.dirname, 'restore.sh')

/** A sandbox with one real backup (stub dump) and an empty restore target. */
function sandboxWithBackup() {
  const sandbox = shellSandbox()
  writeFileSync(join(sandbox.uploads, 'a.pdf'), '%PDF-a')
  expect(runScript(sandbox, BACKUP).status).toBe(0)
  const backup = join(sandbox.backups, readdirSync(sandbox.backups)[0])
  const target = join(sandbox.root, 'restored')
  return { sandbox, backup, target }
}

const stubLog = (sandbox: { log: string }) => readFileSync(sandbox.log, 'utf8')

test('requires a backup directory and an explicit --yes', () => {
  const { sandbox, backup, target } = sandboxWithBackup()
  expect(runScript(sandbox, RESTORE).status).toBe(1)
  expect(runScript(sandbox, RESTORE, [backup, '--bogus']).status).toBe(1)
  const unconfirmed = runScript(sandbox, RESTORE, [backup], {
    UPLOAD_DIR: target,
  })
  expect(unconfirmed.status).toBe(1)
  expect(unconfirmed.stdout).toContain(`UPLOAD_DIR:     ${target}`)
  expect(unconfirmed.stderr).toContain('--yes')
  expect(stubLog(sandbox)).not.toMatch(/pg_restore|psql/)
})

test('never takes the target from ./.env', () => {
  const { sandbox, backup, target } = sandboxWithBackup()
  writeFileSync(
    join(sandbox.root, '.env'),
    [
      'DATABASE_URL=postgresql://dev:pw@localhost:5432/devdb',
      `UPLOAD_DIR=${target}`,
      'PG_DUMP_CONTAINER=docura-db',
    ].join('\n'),
  )
  for (const missing of ['DATABASE_URL', 'UPLOAD_DIR']) {
    const result = runScript(sandbox, RESTORE, [backup, '--yes'], {
      UPLOAD_DIR: target,
      [missing]: undefined,
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`${missing} muss explizit gesetzt sein`)
  }
  const explicit = runScript(sandbox, RESTORE, [backup, '--yes'], {
    UPLOAD_DIR: target,
  })
  expect(explicit.status).toBe(0)
  const log = stubLog(sandbox)
  expect(log).not.toContain('docker exec -i docura-db')
  expect(log).toContain(
    'pg_restore --dbname=postgresql://docura:secret@localhost:5433/docura --clean',
  )
})

test('rejects a backup whose checksum does not match the manifest', () => {
  const { sandbox, backup, target } = sandboxWithBackup()
  writeFileSync(join(backup, 'db.dump'), 'TAMPERED')
  const result = runScript(sandbox, RESTORE, [backup, '--yes'], {
    UPLOAD_DIR: target,
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Prüfsumme von db.dump')
})

test('rejects a backup with a missing file before hashing anything', () => {
  const { sandbox, backup, target } = sandboxWithBackup()
  writeShim(sandbox, 'shasum', 'echo "hashing" >&2; exit 1')
  writeShim(sandbox, 'sha256sum', 'echo "hashing" >&2; exit 1')
  writeFileSync(join(backup, 'manifest.json'), '{"version": 1, "files": {}}')
  const result = runScript(sandbox, RESTORE, [backup, '--yes'], {
    UPLOAD_DIR: target,
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Keine Prüfsumme für db.dump')
  expect(result.stderr).not.toContain('hashing')
})

test('refuses a non-empty UPLOAD_DIR unless --force is given', () => {
  const { sandbox, backup } = sandboxWithBackup()
  const result = runScript(sandbox, RESTORE, [backup, '--yes'])
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('nicht leer')
  const forced = runScript(sandbox, RESTORE, [backup, '--yes', '--force'])
  expect(forced.status).toBe(0)
})

test('refuses a target database with data in any table unless --force is given', () => {
  const { sandbox, backup, target } = sandboxWithBackup()
  const env = { UPLOAD_DIR: target, PG_DUMP_CONTAINER: 'db' }
  const refused = runScript(sandbox, RESTORE, [backup, '--yes'], {
    ...env,
    STUB_TABLES: 'folder, user',
  })
  expect(refused.status).toBe(1)
  expect(refused.stderr).toContain(
    'Ziel-Datenbank ist nicht leer (Tabellen mit Daten: folder, user)',
  )
  expect(stubLog(sandbox)).toContain(
    'docker exec -i db psql -U docura -d docura -X -A -t -c',
  )
  expect(stubLog(sandbox)).toContain("WHERE t.schemaname = 'public'")
  expect(stubLog(sandbox)).not.toContain('pg_restore')
  const empty = runScript(sandbox, RESTORE, [backup, '--yes'], env)
  expect(empty.status).toBe(0)
  writeFileSync(sandbox.log, '')
  const forced = runScript(sandbox, RESTORE, [backup, '--yes', '--force'], {
    ...env,
    STUB_TABLES: 'user',
  })
  expect(forced.status).toBe(0)
  expect(stubLog(sandbox)).not.toContain('psql')
  expect(stubLog(sandbox)).toContain('pg_restore')
})

test('refuses an unreadable or unwritable UPLOAD_DIR before any database work', () => {
  const { sandbox, backup, target } = sandboxWithBackup()
  writeShim(sandbox, 'find', 'exit 1')
  const unreadable = runScript(sandbox, RESTORE, [backup, '--yes'], {
    UPLOAD_DIR: target,
  })
  expect(unreadable.status).toBe(1)
  expect(unreadable.stderr).toContain('UPLOAD_DIR kann nicht gelesen werden')
  expect(stubLog(sandbox)).not.toMatch(/pg_restore|psql/)
  const file = join(sandbox.root, 'not-a-dir')
  writeFileSync(file, '')
  const notDir = runScript(sandbox, RESTORE, [backup, '--yes', '--force'], {
    UPLOAD_DIR: file,
  })
  expect(notDir.status).toBe(1)
  expect(stubLog(sandbox)).not.toMatch(/pg_restore|psql/)
})

test.skipIf(process.getuid?.() === 0)(
  'refuses a read-only UPLOAD_DIR even with --force',
  () => {
    const { sandbox, backup, target } = sandboxWithBackup()
    mkdirSync(target)
    chmodSync(target, 0o500)
    try {
      const result = runScript(sandbox, RESTORE, [backup, '--yes', '--force'], {
        UPLOAD_DIR: target,
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(
        'kein les- und beschreibbares Verzeichnis',
      )
      expect(stubLog(sandbox)).not.toContain('pg_restore')
    } finally {
      chmodSync(target, 0o700)
    }
  },
)

test.skipIf(process.getuid?.() === 0)(
  'refuses a write-only UPLOAD_DIR even with --force',
  () => {
    const { sandbox, backup, target } = sandboxWithBackup()
    mkdirSync(target)
    chmodSync(target, 0o200)
    try {
      const result = runScript(sandbox, RESTORE, [backup, '--yes', '--force'], {
        UPLOAD_DIR: target,
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(
        'kein les- und beschreibbares Verzeichnis',
      )
      expect(stubLog(sandbox)).not.toContain('pg_restore')
    } finally {
      chmodSync(target, 0o700)
    }
  },
)

test('restores the dump and extracts the files', () => {
  const { sandbox, backup, target } = sandboxWithBackup()
  const result = runScript(sandbox, RESTORE, [backup, '--yes'], {
    UPLOAD_DIR: target,
    PG_DUMP_CONTAINER: 'db',
  })
  expect(result.status).toBe(0)
  expect(readFileSync(join(target, 'a.pdf'), 'utf8')).toBe('%PDF-a')
  expect(stubLog(sandbox)).toContain(
    'docker exec -i db pg_restore -U docura -d docura --clean --if-exists --no-owner --no-privileges --single-transaction',
  )
  expect(readFileSync(`${sandbox.log}.stdin`, 'utf8')).toBe('DUMP')
  expect(result.stdout).toContain(
    'DATABASE_URL=postgresql://docura:PASSWORT@localhost:5433/docura bun run db:migrate',
  )
  // Temp paths contain no characters that printf %q would escape.
  expect(result.stdout).toContain(`UPLOAD_DIR=${target} bun run storage:check`)
  expect(result.stdout).not.toContain('secret')
})

test('exits with 2 when pg_restore fails and 3 when tar fails', () => {
  const { sandbox, backup, target } = sandboxWithBackup()
  const restore = runScript(sandbox, RESTORE, [backup, '--yes'], {
    UPLOAD_DIR: target,
    STUB_FAIL: '1',
  })
  expect(restore.status).toBe(2)
  expect(readdirSync(target)).toEqual([])
  writeShim(sandbox, 'tar', 'exit 2')
  mkdirSync(target, { recursive: true })
  const tar = runScript(sandbox, RESTORE, [backup, '--yes'], {
    UPLOAD_DIR: target,
  })
  expect(tar.status).toBe(3)
})

test('prints RESTORE_NEXT_STEPS instead of the bun commands when set', () => {
  const { sandbox, backup, target } = sandboxWithBackup()
  const steps =
    '1. docker compose run --rm migrate\n2. docker compose start app worker'
  const result = runScript(sandbox, RESTORE, [backup, '--yes'], {
    UPLOAD_DIR: target,
    RESTORE_NEXT_STEPS: steps,
  })
  expect(result.status).toBe(0)
  expect(result.stdout).toContain(
    'Nächste Schritte:\n  1. docker compose run --rm migrate\n  2. docker compose start app worker\n',
  )
  expect(result.stdout).not.toContain('bun run')
})
