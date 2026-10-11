// @vitest-environment node
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { runScript, shellSandbox, writeShim } from '@/test/shell'

const SCRIPT = join(import.meta.dirname, 'backup-loop.sh')

test('--once runs one backup now and exits with its code', () => {
  const sandbox = shellSandbox()
  writeFileSync(join(sandbox.uploads, 'a.pdf'), '%PDF-a')
  // Another run's work in progress stays untouched.
  const inProgress = 'docura-backup-x.partial'
  mkdirSync(join(sandbox.backups, inProgress), { recursive: true })
  const ok = runScript(sandbox, SCRIPT, ['--once'])
  expect(ok.status).toBe(0)
  const backups = readdirSync(sandbox.backups)
  expect(backups).toHaveLength(2)
  expect(backups).toContain(inProgress)
  const failed = runScript(shellSandbox(), SCRIPT, ['--once'], {
    STUB_FAIL: '1',
  })
  expect(failed.status).toBe(2)
  expect(failed.stderr).toContain('Sicherung fehlgeschlagen (Exit-Code 2)')
})

test('rejects an invalid BACKUP_TIME or unknown arguments with exit code 1', () => {
  const sandbox = shellSandbox()
  for (const time of ['3:00', '24:00', '12:60', 'nachts']) {
    const result = runScript(sandbox, SCRIPT, [], { BACKUP_TIME: time })
    expect(result.status, time).toBe(1)
    expect(result.stderr).toContain('BACKUP_TIME')
  }
  expect(runScript(sandbox, SCRIPT, ['--now']).status).toBe(1)
  expect(runScript(sandbox, SCRIPT, ['--once', 'x']).status).toBe(1)
})

test('computes the seconds until the next run in UTC', () => {
  const sandbox = shellSandbox()
  const probe = join(sandbox.root, 'probe.sh')
  writeFileSync(probe, 'source "$1"; seconds_until "$2" "$3"\n')
  const until = (time: string, now: number) =>
    runScript(sandbox, probe, [SCRIPT, time, String(now)]).stdout.trim()
  const day = 86_400
  const midnight = 20_000 * day
  expect(until('03:00', midnight)).toBe(String(3 * 3600))
  expect(until('03:00', midnight + 2 * 3600 + 59 * 60)).toBe('60')
  // Due right now or already past: tomorrow.
  expect(until('03:00', midnight + 3 * 3600)).toBe(String(day))
  expect(until('03:00', midnight + 23 * 3600)).toBe(String(4 * 3600))
  expect(until('00:00', midnight + 1)).toBe(String(day - 1))
  expect(until('23:59', midnight)).toBe(String(day - 60))
})

test('keeps looping after a failed backup until it is stopped', () => {
  const sandbox = shellSandbox()
  // The first sleep returns at once; the second stops the loop with SIGTERM,
  // which its trap turns into exit 0.
  writeShim(
    sandbox,
    'sleep',
    `echo "sleep $*" >> "$STUB_LOG"
[ "$(grep -c '^sleep' "$STUB_LOG")" -ge 2 ] && kill -TERM $PPID
exit 0`,
  )
  const result = runScript(sandbox, SCRIPT, [], {
    BACKUP_TIME: '03:00',
    STUB_FAIL: '1',
  })
  expect(result.status).toBe(0)
  expect(result.stdout).toMatch(/nächste Sicherung um 03:00 UTC \(in \d+ s\)/)
  expect(result.stderr).toContain('Sicherung fehlgeschlagen (Exit-Code 2)')
  expect(readFileSync(sandbox.log, 'utf8').match(/^sleep \d+$/gm)).toHaveLength(
    2,
  )
  expect(readdirSync(sandbox.backups)).toEqual([])
})

test('the scheduled loop first removes backups a killed run left behind', () => {
  const sandbox = shellSandbox()
  for (const name of ['docura-backup-x.partial', 'docura-backup-y'])
    mkdirSync(join(sandbox.backups, name), { recursive: true })
  writeShim(sandbox, 'sleep', 'kill -TERM $PPID')
  const result = runScript(sandbox, SCRIPT, [], { BACKUP_TIME: '03:00' })
  expect(result.status).toBe(0)
  expect(result.stdout).toContain(
    `unvollständige Sicherung entfernt: ${join(sandbox.backups, 'docura-backup-x.partial')}`,
  )
  expect(readdirSync(sandbox.backups)).toEqual(['docura-backup-y'])
})
