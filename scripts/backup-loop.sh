#!/usr/bin/env bash
# Daily scheduler for scripts/backup.sh, used by the compose `backup` service
# (the PostgreSQL image has no cron).
#
#   bash scripts/backup-loop.sh          backup.sh every day at BACKUP_TIME,
#                                        after removing stale *.partial dirs
#   bash scripts/backup-loop.sh --once   backup.sh now, exits with its code
#
# Environment:
#   BACKUP_TIME   HH:MM in UTC, default 03:00
#   everything backup.sh reads (DATABASE_URL, UPLOAD_DIR, BACKUP_DIR, …)
#
# A failed backup is logged and the loop waits for the next day: it never
# exits on its own, so the container does not restart in a tight loop.
# Exit codes: 1 usage/invalid BACKUP_TIME; with --once the code of backup.sh.
set -euo pipefail

SCRIPT_NAME=backup-loop
SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=scripts/backup-common.sh
source "$SCRIPT_DIR/backup-common.sh"

TIME_PATTERN='^([01][0-9]|2[0-3]):[0-5][0-9]$'
SECONDS_PER_DAY=86400

usage() {
  fail 1 "Aufruf: bash scripts/backup-loop.sh [--once]"
}

# Seconds from epoch second $2 until the next $1 (HH:MM, UTC); a time that
# is due right now counts as tomorrow, so one minute never runs twice.
seconds_until() {
  local hours=$((10#${1%%:*})) minutes=$((10#${1##*:})) now=$2
  local wait=$((hours * 3600 + minutes * 60 - now % SECONDS_PER_DAY))
  ((wait > 0)) || wait=$((wait + SECONDS_PER_DAY))
  echo "$wait"
}

# Runs backup.sh and returns its exit code (logged when it failed).
run_backup() {
  local code=0
  bash "$SCRIPT_DIR/backup.sh" || code=$?
  [[ $code -eq 0 ]] || echo "$SCRIPT_NAME: Sicherung fehlgeschlagen (Exit-Code $code)" >&2
  return "$code"
}

# Removes the .partial directories of backups that never finished: backup.sh
# drops its own on failure, but not when the container is killed mid-run.
remove_stale_partials() {
  local dir=${BACKUP_DIR:-./backups} partial
  [[ -d $dir ]] || return 0
  while IFS= read -r partial; do
    rm -rf "$partial"
    echo "$SCRIPT_NAME: unvollständige Sicherung entfernt: $partial"
  done < <(find "$dir" -mindepth 1 -maxdepth 1 -type d -name 'docura-backup-*.partial')
}

main() {
  local once=false wait
  case $# in
    0) ;;
    1) [[ $1 == --once ]] || usage; once=true ;;
    *) usage ;;
  esac
  BACKUP_TIME=${BACKUP_TIME:-03:00}
  [[ $BACKUP_TIME =~ $TIME_PATTERN ]] ||
    fail 1 "BACKUP_TIME muss im Format HH:MM (UTC) angegeben werden: $BACKUP_TIME"
  if $once; then
    run_backup
    return
  fi
  # The loop only starts with its container, so a .partial left now comes
  # from a killed run. Not with --once: a manual run may overlap the
  # scheduled one and must not delete its work in progress.
  remove_stale_partials
  # As PID 1 bash ignores SIGTERM unless trapped; `wait` lets the trap run
  # during the sleep instead of after it.
  trap 'exit 0' TERM INT
  while true; do
    wait=$(seconds_until "$BACKUP_TIME" "$(date -u +%s)")
    echo "$SCRIPT_NAME: nächste Sicherung um $BACKUP_TIME UTC (in ${wait} s)"
    sleep "$wait" &
    wait $!
    run_backup || true
  done
}

# Sourcing (tests) only defines the functions.
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
