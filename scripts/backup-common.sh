# Shared helpers of backup.sh and restore.sh; sourced, not executed.
# Callers set SCRIPT_NAME for error messages.

fail() {
  echo "$SCRIPT_NAME: $2" >&2
  exit "$1"
}

sha256_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | cut -d' ' -f1
  else
    shasum -a 256 | cut -d' ' -f1
  fi
}

sha256_of() {
  sha256_stdin <"$1"
}

# Sets DB_USER, DB_HOST and DB_NAME from DATABASE_URL. `docker exec` uses the
# container's trusted local socket instead of host and password.
parse_database_url() {
  local pattern='^postgres(ql)?://([^:@/]+)(:[^@]*)?@([^/]*)/([^?]+)'
  [[ -n ${DATABASE_URL:-} ]] || fail 1 "DATABASE_URL ist nicht gesetzt"
  [[ $DATABASE_URL =~ $pattern ]] ||
    fail 1 "DATABASE_URL hat kein erwartetes Format (postgresql://user:pass@host/db)"
  DB_USER=${BASH_REMATCH[2]}
  DB_HOST=${BASH_REMATCH[4]}
  DB_NAME=${BASH_REMATCH[5]}
}

# Runs a command inside PG_DUMP_CONTAINER (docker exec), or locally.
pg_exec() {
  if [[ -n ${PG_DUMP_CONTAINER:-} ]]; then
    docker exec -i "$PG_DUMP_CONTAINER" "$@"
  else
    "$@"
  fi
}

# Runs a PostgreSQL client tool (pg_dump, pg_restore, psql) against the
# database: in the container as the URL's user, locally via DATABASE_URL.
run_pg_tool() {
  local tool=$1
  shift
  local target=(--dbname="$DATABASE_URL")
  [[ -z ${PG_DUMP_CONTAINER:-} ]] || target=(-U "$DB_USER" -d "$DB_NAME")
  pg_exec "$tool" "${target[@]}" "$@"
}
