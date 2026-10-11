#!/usr/bin/env bash
# Docura restore from a backup created by scripts/backup.sh.
#
#   DATABASE_URL=… UPLOAD_DIR=… bun run restore <backup-dir> --yes [--force]
#
# Replaces the database behind DATABASE_URL with the dump (pg_restore --clean
# in a single transaction) and extracts the files into UPLOAD_DIR. The target
# is never taken from ./.env: DATABASE_URL and UPLOAD_DIR (and, if wanted,
# PG_DUMP_CONTAINER, which runs pg_restore inside that Docker container) must
# be set explicitly. Without --yes it only shows the target. A target database
# with data in any table of schema public and a non-empty UPLOAD_DIR are
# refused unless --force is given; UPLOAD_DIR must be a readable, writable
# and searchable directory.
#
# Exit codes: 0 ok, 1 usage/configuration/invalid backup/target not empty or
# UPLOAD_DIR not readable/writable,
# 2 pg_restore failed, 3 tar failed.
set -euo pipefail

SCRIPT_NAME=restore
# shellcheck source=scripts/backup-common.sh
source "$(dirname "${BASH_SOURCE[0]}")/backup-common.sh"

BACKUP_FILES=(db.dump uploads.tar)

usage() {
  fail 1 "Aufruf: DATABASE_URL=… UPLOAD_DIR=… bun run restore <backup-dir> --yes [--force]"
}

require_explicit() {
  [[ -n ${!1:-} ]] ||
    fail 1 "$1 muss explizit gesetzt sein (die Wiederherstellung liest ./.env nicht)"
}

# The sha256 recorded for one file in manifest.json.
manifest_sha256() {
  sed -n "s/.*\"${1//./\\.}\": *{[^}]*\"sha256\": *\"\([0-9a-f]*\)\".*/\1/p" "$MANIFEST"
}

# Cheap checks first: manifest, files and recorded checksums exist.
check_backup_layout() {
  local file
  [[ -f $MANIFEST ]] || fail 1 "manifest.json fehlt in $BACKUP"
  grep -q '"version": 1,' "$MANIFEST" || fail 1 "Unbekannte Manifest-Version"
  for file in "${BACKUP_FILES[@]}"; do
    [[ -f $BACKUP/$file ]] || fail 1 "$file fehlt in $BACKUP"
    [[ -n $(manifest_sha256 "$file") ]] || fail 1 "Keine Prüfsumme für $file im Manifest"
  done
}

# Reads every byte of the backup once.
verify_checksums() {
  local file
  for file in "${BACKUP_FILES[@]}"; do
    [[ $(sha256_of "$BACKUP/$file") == "$(manifest_sha256 "$file")" ]] ||
      fail 1 "Prüfsumme von $file stimmt nicht"
  done
}

psql_value() {
  run_pg_tool psql -X -A -t -c "$1"
}

# Names of the tables in schema public that hold at least one row (empty
# output when there are none). One EXISTS probe per table via query_to_xml.
NON_EMPTY_TABLES_SQL="SELECT string_agg(t.tablename, ', ' ORDER BY t.tablename)
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND (xpath('/row/c/text()', query_to_xml(
      format('SELECT EXISTS (SELECT 1 FROM %I.%I) AS c', t.schemaname, t.tablename),
      false, true, '')))[1]::text = 'true'"

# Refuses a target database with data in any table; a database without
# tables, or with the empty tables of a fresh db:migrate, counts as empty.
check_target_database() {
  local tables
  tables=$(psql_value "$NON_EMPTY_TABLES_SQL") ||
    fail 1 "Ziel-Datenbank nicht erreichbar: $DB_NAME"
  [[ -z $tables ]] ||
    fail 1 "Ziel-Datenbank ist nicht leer (Tabellen mit Daten: $tables) – --force überschreibt sie"
}

# Runs before any database work, also with --force.
check_upload_dir_writable() {
  [[ -d $UPLOAD_DIR && -r $UPLOAD_DIR && -w $UPLOAD_DIR && -x $UPLOAD_DIR ]] ||
    fail 1 "UPLOAD_DIR ist kein les- und beschreibbares Verzeichnis: $UPLOAD_DIR"
}

check_target_upload_dir() {
  local entries
  entries=$(find "$UPLOAD_DIR" -mindepth 1 -maxdepth 1 -print -quit) ||
    fail 1 "UPLOAD_DIR kann nicht gelesen werden: $UPLOAD_DIR"
  [[ -z $entries ]] ||
    fail 1 "UPLOAD_DIR ist nicht leer: $UPLOAD_DIR (--force überschreibt gleichnamige Dateien)"
}

# DATABASE_URL with the password replaced by PASSWORT, for printed commands.
masked_database_url() {
  local pattern='^(postgres(ql)?://[^:@/]+):[^@]*@(.*)$'
  if [[ $DATABASE_URL =~ $pattern ]]; then
    printf '%s' "${BASH_REMATCH[1]}:PASSWORT@${BASH_REMATCH[3]}"
  else
    printf '%s' "$DATABASE_URL"
  fi
}

# Bun keeps variables that are already set, so the prefix makes the
# follow-up commands use the restored target instead of ./.env.
# RESTORE_NEXT_STEPS replaces them where these commands do not apply
# (the compose `restore` service).
print_next_steps() {
  if [ -n "${RESTORE_NEXT_STEPS:-}" ]; then
    echo "Wiederherstellung abgeschlossen. Nächste Schritte:"
    printf '%s\n' "$RESTORE_NEXT_STEPS" | sed 's/^/  /'
    return
  fi
  local db upload
  db=$(printf 'DATABASE_URL=%q' "$(masked_database_url)")
  upload=$(printf 'UPLOAD_DIR=%q' "$UPLOAD_DIR")
  echo "Wiederherstellung abgeschlossen. Nächste Schritte mit demselben Ziel"
  echo "(PASSWORT durch das Passwort der Ziel-Datenbank ersetzen):"
  echo "  1. $db bun run db:migrate"
  echo "  2. Web-App und Worker mit diesem DATABASE_URL und UPLOAD_DIR neu starten"
  echo "  3. $db $upload bun run storage:check"
}

BACKUP=""
CONFIRMED=false
FORCE=false
for arg in "$@"; do
  case $arg in
    --yes) CONFIRMED=true ;;
    --force) FORCE=true ;;
    -*) usage ;;
    *) [[ -z $BACKUP ]] || usage; BACKUP=$arg ;;
  esac
done
[[ -n $BACKUP ]] || usage
require_explicit DATABASE_URL
require_explicit UPLOAD_DIR
parse_database_url
[[ -d $BACKUP ]] || fail 1 "Sicherung nicht gefunden: $BACKUP"
MANIFEST="$BACKUP/manifest.json"
check_backup_layout
verify_checksums

echo "Sicherung:      $BACKUP"
echo "Ziel-Datenbank: $DB_NAME auf ${PG_DUMP_CONTAINER:-$DB_HOST} (Benutzer $DB_USER)"
echo "UPLOAD_DIR:     $UPLOAD_DIR"
$CONFIRMED || fail 1 "Abbruch: Die Ziel-Datenbank wird überschrieben. Zum Fortfahren --yes angeben."

mkdir -p "$UPLOAD_DIR" || fail 1 "UPLOAD_DIR kann nicht angelegt werden: $UPLOAD_DIR"
check_upload_dir_writable
if ! $FORCE; then
  check_target_upload_dir
  check_target_database
fi

run_pg_tool pg_restore --clean --if-exists --no-owner --no-privileges \
  --single-transaction <"$BACKUP/db.dump" ||
  fail 2 "pg_restore fehlgeschlagen; die Datenbank ist unverändert"
tar -xf "$BACKUP/uploads.tar" -C "$UPLOAD_DIR" || fail 3 "tar fehlgeschlagen"

print_next_steps
