# Docura

A German-language shared document management system. All authenticated users share a single document library and can upload, organize, search, and preview documents.

## Tech Stack

- **Astro 7** — SSR framework with Node adapter
- **Vue 3** — Interactive components
- **Better Auth** — Authentication with passkey (WebAuthn) support
- **Drizzle ORM** — Database toolkit with PostgreSQL via Bun's native SQL driver
- **Tailwind CSS 4** — Utility-first styling
- **Reka UI** — Headless component primitives (shadcn-vue)

## Prerequisites

- [Bun](https://bun.sh)
- [PostgreSQL](https://www.postgresql.org)

## Getting Started

1. Clone the repository and install dependencies:

   ```sh
   bun install
   ```

2. Copy `.env.example` to `.env` and configure the environment variables:

   ```sh
   cp .env.example .env
   ```

   | Variable             | Description                        | Example                                              |
   | :------------------- | :--------------------------------- | :--------------------------------------------------- |
   | `DATABASE_URL`       | PostgreSQL connection string       | `postgresql://docura:password@localhost:5432/docura` |
   | `BETTER_AUTH_SECRET` | 32-byte base64 secret for sessions | _(generate with `openssl rand -base64 32`)_          |
   | `BETTER_AUTH_URL`    | Auth callback base URL             | `http://localhost:4321`                              |
   | `PASSKEY_RP_ID`      | WebAuthn relying party ID          | `localhost`                                          |
   | `PASSKEY_ORIGIN`     | WebAuthn origin                    | `http://localhost:4321`                              |

   The remaining variables are described in `.env.example`.
   `TRASH_RETENTION_DAYS` (default 90) is how long trashed documents are kept
   before the worker deletes them permanently. Values of `0` or below and
   invalid values fall back to 90 days; there is no "delete immediately"
   setting.

3. Run database migrations:

   ```sh
   bun run db:migrate
   ```

4. Start the development server:

   ```sh
   bun --bun run dev
   ```

   The app will be available at `http://localhost:4321`.

## Scripts

All commands are run from the project root:

| Command                      | Action                                         |
| :--------------------------- | :--------------------------------------------- |
| `bun --bun run dev`          | Start dev server at `localhost:4321`           |
| `bun run build`              | Build for production                           |
| `bun --bun run preview`      | Preview production build                       |
| `bun run db:generate`        | Generate Drizzle migrations from schema        |
| `bun run db:migrate`         | Run database migrations                        |
| `bun run worker`             | Start the background processing worker         |
| `bun run embeddings:clear`   | Remove all document embeddings                 |
| `bun run embeddings:reembed` | Queue embedding jobs (`--all`: every document) |
| `bun run backup`             | Back up database and files (see "Backup")      |
| `bun run restore`            | Restore a backup (see "Restore")               |
| `bun run storage:check`      | Compare database rows with stored files        |
| `bun run export`             | Export the library as a ZIP with metadata      |
| `bun run test`               | Run unit and Vue interaction tests             |
| `bun run test:coverage`      | Generate Istanbul and LCOV coverage            |
| `bun run fallow`             | Audit changes against `origin/main`            |
| `bun run fallow:health`      | Report whole-project health                    |
| `bun run lint --type-aware`  | Run OxLint                                     |
| `bun run astro check`        | Run Astro project checks                       |

## Processing and system status

The worker (`bun run worker`) extracts text, runs OCR and the LLM analysis and
stores embeddings. Running jobs renew a heartbeat; when a worker crashes or is
killed, its jobs are reset after `STALE_JOB_TIMEOUT_MINUTES` (default 10) and
retried while attempts remain. Documents can be reprocessed from the detail
page or as a bulk action ("Neu verarbeiten"). The **System** page (`/system`)
shows whether the worker is alive, the reachability of the database, Redis,
OCR service and Ollama (including whether the configured models are
installed), and the queue counts. Queue counts use each document's latest job.
"Ausstehend" and "In Verarbeitung" include archived documents (e.g. during a
re-embedding); "Fehlgeschlagen" only counts the regular document list (not
archived or trashed), so it matches the list filter `/documents?status=failed`.

## Changing the embedding model

Embeddings of different models are not comparable, and the `document.embedding`
column has a fixed dimension (`EMBEDDING_DIMENSIONS` in
`src/db/schema/embedding.ts`, 1024 for `mxbai-embed-large`). A populated column
cannot be altered to another dimension, so the old vectors are removed before
migrating:

1. Stop the worker.
2. Remove all embeddings: `bun run embeddings:clear`.
3. Set `OLLAMA_EMBED_MODEL`. If the new model has a different dimension, change
   `EMBEDDING_DIMENSIONS` and run `bun run db:generate`. Then run
   `bun run db:migrate`.
4. Start the worker (`bun run worker`); it refuses to start if the column does
   not match `EMBEDDING_DIMENSIONS`. Restart the web app with the new
   `OLLAMA_EMBED_MODEL` as well, since search embeds queries with it. If
   `EMBEDDING_DIMENSIONS` changed, rebuild (`bun run build`) and redeploy the
   web app first, because the dimension is compiled into it.
5. Queue the re-embedding: `bun run embeddings:reembed`. These jobs reuse the
   stored text, so scans are not OCRed again. Progress is visible on the
   System page.

Semantic search returns no results for a document until its new embedding is
stored; full-text search keeps working throughout.

## Backup

`bun run backup` (`scripts/backup.sh`, plain bash so it also runs in a
PostgreSQL-based container without Bun) writes

```
$BACKUP_DIR/docura-backup-<YYYYMMDDTHHMMSSZ>/
  db.dump          pg_dump --format=custom --no-owner --no-privileges
  uploads.tar      UPLOAD_DIR without watcher snapshots (*.tmp); uncompressed,
                   the stored PDFs and images are compressed already
  manifest.json    version, createdAt, database, pg_dump version, file count,
                   size and SHA-256 of both files
```

The backup is written to `<name>.partial/` and renamed when it is complete, so
a cron job never picks up a half-written backup; on failure the partial
directory is removed. Backups are written owner-only (`umask 077`: directories
`0700`, files `0600`), since they contain credentials and documents. `backup`
reads unset variables from `./.env` (it only reads from the database);
`restore` never does.

| Variable                 | Meaning                                                              |
| :----------------------- | :------------------------------------------------------------------- |
| `DATABASE_URL`           | Database to dump (required)                                          |
| `UPLOAD_DIR`             | Uploaded files (default `./uploads`)                                 |
| `BACKUP_DIR`             | Target directory (default `./backups`)                               |
| `BACKUP_RETENTION_COUNT` | Keep the newest N backups; `0` (default) keeps all                   |
| `PG_DUMP_CONTAINER`      | Run `pg_dump` via `docker exec` in this container (dev: `docura-db`) |

`pg_dump` must be at least the server's major version (18). Hosts rarely have
that, so in development use the database container:
`PG_DUMP_CONTAINER=docura-db bun run backup`. Exit codes: `0` ok, `1`
configuration, `2` pg_dump failed, `3` tar or manifest failed. Errors go to
stderr, a single summary line to stdout. Example crontab entry:

```
0 3 * * * cd /srv/docura && flock -n /tmp/docura-backup.lock bun run backup
```

A compose service for scheduled backups follows with the deployment setup.

The database is dumped first, the files afterwards. Stored files are immutable
(UUID names), so the only possible drift is a file uploaded in between (an
orphan file without row) or a trash cleanup in between (a row of an expired
document without file). `bun run storage:check` reports both after a restore.

## Restore

The target PostgreSQL needs the pgvector extension (image
`pgvector/pgvector:pg18`). The dump contains `CREATE EXTENSION` for `vector`
and `pg_trgm`, so both a fresh database and one initialized with
`docker/init-extensions.sql` work.

1. Stop the web app and the worker.
2. Set the target explicitly on the command line: `restore` ignores `./.env`,
   so a development `.env` can never redirect it to the wrong database.
   `DATABASE_URL` and `UPLOAD_DIR` are required; `PG_DUMP_CONTAINER=<container>`
   runs `pg_restore` (and the `psql` target check) inside that database
   container.
3. Run `DATABASE_URL=… UPLOAD_DIR=… bun run restore <backup-dir>` to verify
   the backup and see the target, then repeat with `--yes`. The script first
   checks the manifest and that all files exist, then their SHA-256.
   `UPLOAD_DIR` must be a writable directory (it is created if missing). The
   script refuses a non-empty or unreadable `UPLOAD_DIR` and a target
   database with data in any table of schema `public` (a database without
   tables, or with the empty tables of a fresh `db:migrate`, counts as empty)
   unless `--force` is given. The dump is restored with
   `pg_restore --clean --if-exists` in a single transaction: on failure the
   database stays unchanged. On success it prints the next steps with the
   target filled in (the password replaced by `PASSWORT`).
4. `DATABASE_URL=… bun run db:migrate` with the same `DATABASE_URL`: a no-op
   for a backup of the same version; applies newer migrations when an older
   backup is restored into newer code. Without the prefix, Drizzle Kit reads
   `./.env` and migrates that database instead.
5. Start the web app and the worker against the restored target (the worker
   checks the database schema on start), then run
   `DATABASE_URL=… UPLOAD_DIR=… bun run storage:check` with the same values;
   it also reads `./.env` for anything that is not set.

Example against a fresh database container on port 5434:

```
DATABASE_URL=postgresql://docura:x@localhost:5434/docura \
UPLOAD_DIR=/srv/docura-restore/uploads PG_DUMP_CONTAINER=docura-db-restore \
  bun run restore backups/docura-backup-<ts> --yes
DATABASE_URL=postgresql://docura:x@localhost:5434/docura \
  bun run db:migrate
DATABASE_URL=postgresql://docura:x@localhost:5434/docura \
UPLOAD_DIR=/srv/docura-restore/uploads \
  bun run storage:check
```

Exit codes: `0` ok, `1` usage, invalid backup, not confirmed, target not
empty or `UPLOAD_DIR` not usable, `2` pg_restore failed, `3` extracting the
files failed.

## Consistency check

`bun run storage:check` compares the `document` table with `UPLOAD_DIR` and
reports documents without file, files without document (orphans) and size
mismatches. Watcher snapshots (`*.tmp`), dotfiles and subdirectories are
ignored. Orphans younger than `STORAGE_ORPHAN_MIN_AGE_MINUTES` (default 60)
may be uploads in flight; they are only counted as pending.

| Option             | Effect                                                             |
| :----------------- | :----------------------------------------------------------------- |
| `--json`           | Machine-readable report instead of the German summary              |
| `--verify-hashes`  | Also compare SHA-256 hashes (reads every file)                     |
| `--delete-orphans` | Delete orphan files older than the minimum age; never deletes rows |

Exit codes: `0` consistent, `1` findings (suitable for cron alerting), `2`
error. Documents without file are recovered from a backup or deleted
permanently in the UI. Permanent deletion removes the row before the file, so
an interrupted deletion leaves an orphan file, which `--delete-orphans`
reclaims.

## Export

The document list has an "Exportieren (n)" button that downloads everything
currently shown (view, filters and full-text search; not available for
semantic search) as a ZIP; the bulk bar exports the selected documents. The
CLI exports the whole library without size limit:

```
bun run export [--out <file.zip>] [--include-archived] [--include-trash]
```

The ZIP contains the files in their folder structure (`Ordner/Unterordner/`,
unfiled documents at the root) with their original names (unsafe characters
replaced, case-insensitive duplicates numbered as `name (2).pdf`), plus:

- `metadata.json`: `{version, exportedAt, count, documents}`; per document
  `id, path, name, mimeType, fileSize, sha256, folder, correspondent,
documentDate, tags [{name, color}], isFavorite, archivedAt, trashedAt,
createdAt, updatedAt, textContent, fileMissing`.
- `metadata.csv`: the same columns without `textContent`, UTF-8 with BOM,
  `;`-separated, tags joined with `|`. Text values that start with `=`, `+`,
  `-`, `@`, a tab or a carriage return get a leading `'`, so a spreadsheet
  does not run them as formulas (names, tags and correspondents may come
  from untrusted files). `metadata.json` keeps the original values.

Windows device names (`CON`, `NUL.pdf`, `LPT1`, …) get a leading `_`. A root
folder named like a metadata file becomes `<name> (Ordner)`, and a file never
gets the path of a folder (`Rechnung.pdf` next to a folder `Rechnung.pdf`
becomes `Rechnung (2).pdf`).

A document whose file is missing or unreadable is listed with
`fileMissing: true`. The web export is streamed (no temporary file) and
limited to `EXPORT_MAX_DOCUMENTS` (default 10000) documents; larger selections
are rejected with 413 and the export button is disabled.

The stream is throttled to the client's download speed only with the patched
Astro Node adapter (see "Astro write backpressure patch").

## Known Workarounds

### Astro write backpressure patch

`patches/astro@<version>.patch` (registered in `patchedDependencies` in
`package.json`, applied by `bun install`) makes the Node adapter's
`writeResponse` wait for `drain` when the socket buffer is full. Unpatched,
Astro keeps pulling the response body, so a slow or stalled client of an
export or a large file makes the server buffer the whole body in memory.
`src/lib/server/astro-backpressure.test.ts` fails if the patch is missing.
On every Astro upgrade, check whether upstream fixed it; otherwise re-create
the patch (`bun patch astro`, edit `dist/core/app/node.js`,
`bun patch --commit node_modules/astro`). Any Docker build context must
include the `patches/` directory, because `bun install` fails without it.
The dev server (Vite middleware) is not patched.

### `postgres` devDependency

The `postgres` package is listed as a devDependency but is **not used at runtime** — the app uses Bun's native SQL driver (`bun:sql`) for all database access.

It exists solely because Drizzle Kit CLI commands (`db:generate`, `db:migrate`, etc.) require a recognized PostgreSQL driver package to connect to the database. Drizzle Kit does not support `bun:sql` yet.

Upstream issue: [drizzle-orm#4122](https://github.com/drizzle-team/drizzle-orm/issues/4122)

This dependency can be removed once Drizzle Kit adds native Bun SQL support.

## Code quality

Run `bun run test:coverage` before `bun run fallow` so Fallow can use current
Istanbul coverage from `coverage/coverage-final.json`. Coverage output is ignored
by Git. Tests use Vitest and happy-dom; OCR client tests use Node's native web APIs.
Database, Ollama and Bun-specific integrations are mocked in unit tests, so a
passing suite does not replace an end-to-end check against running services.

GitHub Actions checks types, lint, tests, build, the strict changed-code audit,
and a whole-project health floor of 88. It publishes health, duplication,
dead-code and coverage reports as artifacts. The browser import boundary prevents
runtime dependencies on database and worker modules while permitting shared
helpers and type-only imports.
