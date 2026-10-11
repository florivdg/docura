#!/usr/bin/env bash
# Docura backup: database dump + uploaded files + manifest.
#
#   bun run backup        (or: bash scripts/backup.sh)
#
# Environment:
#   DATABASE_URL            required, postgresql://user:pass@host:port/db
#   UPLOAD_DIR              default ./uploads
#   BACKUP_DIR              default ./backups
#   BACKUP_RETENTION_COUNT  default 0 = keep all; otherwise keep the newest N
#   PG_DUMP_CONTAINER       optional: run pg_dump inside this Docker container
# Unset variables are read from ./.env (the backup only reads the database).
#
# Result: $BACKUP_DIR/docura-backup-<YYYYMMDDTHHMMSSZ>/{db.dump,uploads.tar,manifest.json}
# Exit codes: 0 ok, 1 usage/configuration, 2 pg_dump failed, 3 tar/manifest failed.
set -euo pipefail
# Backups contain credentials and documents: dirs 0700, files 0600.
umask 077

SCRIPT_NAME=backup
# shellcheck source=scripts/backup-common.sh
source "$(dirname "${BASH_SOURCE[0]}")/backup-common.sh"
# macOS tar would otherwise add AppleDouble (._*) files.
export COPYFILE_DISABLE=1

# `bun run` does not pass .env to non-Bun scripts: read ./.env like Bun does,
# without overriding variables that are already set. Values are not evaluated:
# ${VAR} expansion is not supported. A trailing ` # comment` is dropped, after
# a closing quote or, for unquoted values, after whitespace.
load_dotenv() {
  local line key value
  local assignment='^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$'
  local quoted="^\"(.*)\"[[:space:]]*(#.*)?\$|^'(.*)'[[:space:]]*(#.*)?\$"
  [[ -f .env ]] || return 0
  while IFS= read -r line || [[ -n $line ]]; do
    [[ $line =~ $assignment ]] || continue
    key=${BASH_REMATCH[2]}
    value=${BASH_REMATCH[3]%$'\r'}
    [[ -z ${!key+x} ]] || continue
    if [[ $value =~ $quoted ]]; then
      value=${BASH_REMATCH[1]}${BASH_REMATCH[3]}
    else
      value=${value%%[[:space:]]#*}
    fi
    export "$key=$value"
  done <.env
}

byte_size() {
  wc -c <"$1" | tr -d ' '
}

json_escape() {
  local value=${1//\\/\\\\}
  printf '%s' "${value//\"/\\\"}"
}

# GNU tar exits with 1 when a file changed while it was read (an upload in
# flight); that file has no row in the earlier dump, so it is only a warning.
tolerate_changed_files() {
  if [[ $1 -eq 1 ]] && tar --version 2>/dev/null | grep -q 'GNU tar'; then
    echo "backup: Warnung: Dateien haben sich während der Sicherung geändert" >&2
    return 0
  fi
  return "$1"
}

# Writes an uncompressed tar of UPLOAD_DIR (the stored PDFs and images are
# compressed already) to $1 and prints its SHA-256, computed while writing.
archive_uploads() {
  { tar -cf - --exclude='*.tmp' -C "$UPLOAD_DIR" . || tolerate_changed_files $?; } |
    tee "$1" | sha256_stdin
}

# Exits with 3 unless $2 is a SHA-256 (of file $1): a failed or empty hash
# must never end up in a manifest that is reported as complete.
require_sha256() {
  [[ $2 =~ ^[0-9a-f]{64}$ ]] || fail 3 "SHA-256 von $1 konnte nicht berechnet werden"
}

# Only interpolates values computed (and checked) beforehand.
write_manifest() {
  local dir=$1 version=$2 count=$3
  cat >"$dir/manifest.json" <<JSON
{
  "version": 1,
  "createdAt": "$CREATED_AT",
  "database": "$(json_escape "$DB_NAME")",
  "pgDumpVersion": "$(json_escape "$version")",
  "uploadDir": "$(json_escape "$UPLOAD_DIR")",
  "uploadFileCount": $count,
  "files": {
    "db.dump": {"bytes": $DUMP_BYTES, "sha256": "$DUMP_SHA256"},
    "uploads.tar": {"bytes": $UPLOADS_BYTES, "sha256": "$UPLOADS_SHA256"}
  }
}
JSON
}

# Keeps the newest BACKUP_RETENTION_COUNT completed backups (names sort by time).
prune_backups() {
  [[ $RETENTION -gt 0 ]] || return 0
  local backups=() dir
  while IFS= read -r dir; do backups+=("$dir"); done < <(
    find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'docura-backup-*' ! -name '*.partial' | sort
  )
  local excess=$((${#backups[@]} - RETENTION)) i
  for ((i = 0; i < excess; i++)); do
    rm -rf "${backups[$i]}"
    echo "backup: alte Sicherung entfernt: ${backups[$i]}" >&2
  done
}

load_dotenv
parse_database_url
UPLOAD_DIR=${UPLOAD_DIR:-./uploads}
BACKUP_DIR=${BACKUP_DIR:-./backups}
RETENTION=${BACKUP_RETENTION_COUNT:-0}
[[ -d $UPLOAD_DIR ]] || fail 1 "UPLOAD_DIR ist kein Verzeichnis: $UPLOAD_DIR"
[[ $RETENTION =~ ^[0-9]+$ ]] || fail 1 "BACKUP_RETENTION_COUNT muss eine Zahl sein"

CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NAME="docura-backup-$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$BACKUP_DIR/$NAME"
PARTIAL="$FINAL.partial"
[[ ! -e $FINAL ]] || fail 1 "Sicherung existiert bereits: $FINAL"
mkdir -p "$BACKUP_DIR"
mkdir "$PARTIAL" || fail 1 "Verzeichnis kann nicht angelegt werden: $PARTIAL"
# Cron must never see a half-written backup: drop the .partial on any failure.
trap 'rm -rf "$PARTIAL"' EXIT

# Database first: files are immutable, so later uploads only add orphans.
run_pg_tool pg_dump --format=custom --no-owner --no-privileges >"$PARTIAL/db.dump" ||
  fail 2 "pg_dump fehlgeschlagen"
PG_DUMP_VERSION=$(pg_exec pg_dump --version) || fail 2 "pg_dump --version fehlgeschlagen"

UPLOADS_SHA256=$(archive_uploads "$PARTIAL/uploads.tar") || fail 3 "tar fehlgeschlagen"
require_sha256 uploads.tar "$UPLOADS_SHA256"
UPLOADS_BYTES=$(byte_size "$PARTIAL/uploads.tar") || fail 3 "Größe von uploads.tar unbekannt"
DUMP_BYTES=$(byte_size "$PARTIAL/db.dump") || fail 3 "Größe von db.dump unbekannt"
DUMP_SHA256=$(sha256_of "$PARTIAL/db.dump") || fail 3 "SHA-256 von db.dump fehlgeschlagen"
require_sha256 db.dump "$DUMP_SHA256"
FILE_COUNT=$(find "$UPLOAD_DIR" -type f ! -name '*.tmp' | wc -l | tr -d ' ') ||
  fail 3 "Dateien in UPLOAD_DIR konnten nicht gezählt werden"
write_manifest "$PARTIAL" "$PG_DUMP_VERSION" "$FILE_COUNT" ||
  fail 3 "manifest.json konnte nicht geschrieben werden"

mv "$PARTIAL" "$FINAL" || fail 3 "Umbenennen fehlgeschlagen: $PARTIAL"
trap - EXIT
prune_backups
echo "Sicherung erstellt: $FINAL ($FILE_COUNT Dateien)"
