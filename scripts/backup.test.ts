// @vitest-environment node
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { computeSha256 } from '@/lib/hash'
import { runScript, shellSandbox, writeShim } from '@/test/shell'

const SCRIPT = join(import.meta.dirname, 'backup.sh')

const sha256 = (path: string) => computeSha256(readFileSync(path))

function sandboxWithUploads() {
  const sandbox = shellSandbox()
  writeFileSync(join(sandbox.uploads, 'a.pdf'), '%PDF-a')
  writeFileSync(join(sandbox.uploads, 'b.png'), 'png')
  writeFileSync(join(sandbox.uploads, 'c.pdf.tmp'), 'in flight')
  return sandbox
}

test('rejects a missing DATABASE_URL or UPLOAD_DIR with exit code 1', () => {
  const sandbox = shellSandbox()
  const noUrl = runScript(sandbox, SCRIPT, [], { DATABASE_URL: undefined })
  expect(noUrl.status).toBe(1)
  expect(noUrl.stderr).toContain('DATABASE_URL')
  const noDir = runScript(sandbox, SCRIPT, [], {
    UPLOAD_DIR: join(sandbox.root, 'missing'),
  })
  expect(noDir.status).toBe(1)
  expect(existsSync(sandbox.backups)).toBe(false)
})

test('writes dump, upload archive and manifest into a timestamped directory', () => {
  const sandbox = sandboxWithUploads()
  const result = runScript(sandbox, SCRIPT)
  expect(result.status).toBe(0)
  const [name] = readdirSync(sandbox.backups)
  expect(name).toMatch(/^docura-backup-\d{8}T\d{6}Z$/)
  expect(result.stdout).toContain(name)
  const dir = join(sandbox.backups, name)
  // Owner-only: backups contain credentials and documents.
  expect(statSync(dir).mode & 0o777).toBe(0o700)
  for (const file of ['db.dump', 'uploads.tar', 'manifest.json']) {
    expect(statSync(join(dir, file)).mode & 0o077).toBe(0)
  }
  expect(readFileSync(join(dir, 'db.dump'), 'utf8')).toBe('DUMP')
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({
    version: 1,
    database: 'docura',
    pgDumpVersion: 'pg_dump (PostgreSQL) 18.1',
    uploadFileCount: 2,
  })
  expect(manifest.files['db.dump']).toEqual({
    bytes: 4,
    sha256: sha256(join(dir, 'db.dump')),
  })
  const archive = join(dir, 'uploads.tar')
  expect(manifest.files['uploads.tar']).toEqual({
    bytes: readFileSync(archive).length,
    sha256: sha256(archive),
  })
  // Uncompressed: the stored files are compressed already.
  const listing = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' })
  expect(listing).toContain('a.pdf')
  expect(listing).not.toContain('.tmp')
  expect(readFileSync(sandbox.log, 'utf8')).toContain(
    'pg_dump --dbname=postgresql://docura:secret@localhost:5433/docura --format=custom --no-owner --no-privileges',
  )
})

test('runs pg_dump inside PG_DUMP_CONTAINER as the URL user', () => {
  const sandbox = sandboxWithUploads()
  const result = runScript(sandbox, SCRIPT, [], { PG_DUMP_CONTAINER: 'db' })
  expect(result.status).toBe(0)
  const log = readFileSync(sandbox.log, 'utf8')
  expect(log).toContain(
    'docker exec -i db pg_dump -U docura -d docura --format=custom',
  )
  expect(log).toContain('docker exec -i db pg_dump --version')
})

test('exits with 2 or 3 and removes the partial backup on failure', () => {
  const sandbox = sandboxWithUploads()
  const dump = runScript(sandbox, SCRIPT, [], { STUB_FAIL: '1' })
  expect(dump.status).toBe(2)
  expect(readdirSync(sandbox.backups)).toEqual([])
  writeShim(sandbox, 'tar', 'exit 2')
  const tar = runScript(sandbox, SCRIPT)
  expect(tar.status).toBe(3)
  expect(readdirSync(sandbox.backups)).toEqual([])
})

test('keeps only the newest backups when a retention count is set', () => {
  const sandbox = sandboxWithUploads()
  const old = ['20200101T000000Z', '20210101T000000Z', '20220101T000000Z']
  for (const stamp of old)
    mkdirSync(join(sandbox.backups, `docura-backup-${stamp}`), {
      recursive: true,
    })
  const invalid = runScript(sandbox, SCRIPT, [], {
    BACKUP_RETENTION_COUNT: 'x',
  })
  expect(invalid.status).toBe(1)
  const result = runScript(sandbox, SCRIPT, [], { BACKUP_RETENTION_COUNT: '2' })
  expect(result.status).toBe(0)
  const remaining = readdirSync(sandbox.backups).sort()
  expect(remaining).toHaveLength(2)
  expect(remaining[0]).toBe('docura-backup-20220101T000000Z')
})

test('reads unset variables from ./.env without overriding the environment', () => {
  const sandbox = sandboxWithUploads()
  writeFileSync(
    join(sandbox.root, '.env'),
    [
      '# comment',
      `export DATABASE_URL="postgresql://envuser:pw@db:5432/envdb?sslmode=disable"`,
      `BACKUP_DIR='${join(sandbox.root, 'from-env')}'`,
      'PG_DUMP_CONTAINER=from-env',
    ].join('\n'),
  )
  const result = runScript(sandbox, SCRIPT, [], {
    DATABASE_URL: undefined,
    BACKUP_DIR: undefined,
    PG_DUMP_CONTAINER: 'explicit',
  })
  expect(result.status).toBe(0)
  expect(readdirSync(join(sandbox.root, 'from-env'))).toHaveLength(1)
  expect(readFileSync(sandbox.log, 'utf8')).toContain(
    'docker exec -i explicit pg_dump -U envuser -d envdb',
  )
})

test('drops inline comments from ./.env values', () => {
  const sandbox = sandboxWithUploads()
  writeFileSync(
    join(sandbox.root, '.env'),
    [
      'DATABASE_URL="postgresql://u:p@h/db" # prod',
      `UPLOAD_DIR=${sandbox.uploads} # comment`,
      "BACKUP_DIR='backups-from-env'   # quoted",
    ].join('\n'),
  )
  const result = runScript(sandbox, SCRIPT, [], {
    DATABASE_URL: undefined,
    UPLOAD_DIR: undefined,
    BACKUP_DIR: undefined,
  })
  expect(result.status).toBe(0)
  expect(readFileSync(sandbox.log, 'utf8')).toContain(
    'pg_dump --dbname=postgresql://u:p@h/db --format=custom',
  )
  expect(readdirSync(join(sandbox.root, 'backups-from-env'))).toHaveLength(1)
})

test('exits with 3 and keeps no backup when a checksum cannot be computed', () => {
  const sandbox = sandboxWithUploads()
  // Prints nothing for the dump, a valid-looking hash for everything else.
  const shim = `tmp=$(mktemp); cat > "$tmp"
if [ "$(head -c 4 "$tmp")" = DUMP ]; then rm -f "$tmp"; exit 0; fi
rm -f "$tmp"; printf '%064d  -\\n' 0`
  writeShim(sandbox, 'sha256sum', shim)
  writeShim(sandbox, 'shasum', shim)
  const empty = runScript(sandbox, SCRIPT)
  expect(empty.status).toBe(3)
  expect(empty.stderr).toContain('SHA-256 von db.dump')
  expect(readdirSync(sandbox.backups)).toEqual([])
  writeShim(sandbox, 'sha256sum', 'cat > /dev/null; exit 1')
  writeShim(sandbox, 'shasum', 'cat > /dev/null; exit 1')
  const failing = runScript(sandbox, SCRIPT)
  expect(failing.status).toBe(3)
  expect(readdirSync(sandbox.backups)).toEqual([])
})
