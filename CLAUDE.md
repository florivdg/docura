# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Docura is a German-language shared document management system built with Astro 7, Vue 3, and Better Auth. It uses PostgreSQL (via Bun SQL) with Drizzle ORM and features passkey (WebAuthn) authentication support. All authenticated users share a single document library and can upload, organize, search, and preview documents.

Uploads are enriched asynchronously by a background worker (`src/worker/`): text extraction, OCR, LLM-based metadata (tags, folder, correspondent, Belegdatum) and vector embeddings. Search combines German full-text search with semantic vector search.

## Commands

```bash
# Development
bun --bun run dev      # Start dev server at localhost:4321
bun run build          # Build for production
bun --bun run preview  # Preview production build
bun run worker         # Start the background worker (processing, watch folder, trash cleanup)

# Database
bun run db:generate  # Generate Drizzle migrations from schema - never run this directly
bun run db:migrate   # Run database migrations - never run this directly
                     # (scripts/migrate.ts: Drizzle's runtime migrator for bun:sql; creates the
                     #  vector/pg_trgm extensions first, then applies drizzle/)
bun run db:studio    # Drizzle Studio

# Maintenance
bun run backfill:sha256                      # Hash existing documents so dedup applies to the old library
bun run embeddings:clear                     # Drop all embeddings (before migrating to another embedding dimension)
bun run embeddings:reembed [--all]           # Queue embedding-only jobs for documents without (or --all) vectors
bun run user:add <email> <password> [name] [--admin]  # Create a user (--admin for the first admin)
bun run user:role <email> <admin|user>                # Change a user's role
bun run user:password <email> <new-password>          # Reset a password without SMTP (revokes sessions)
bun run backup                                # DB dump + uploads + manifest into BACKUP_DIR (PG_DUMP_CONTAINER=docura-db in dev)
DATABASE_URL=… UPLOAD_DIR=… bun run restore <backup-dir> --yes [--force]  # Ignores .env; refuses non-empty targets without --force
bun run storage:check [--json] [--verify-hashes] [--delete-orphans]  # DB rows vs. files, exit 1 on findings
bun run export [--out f.zip] [--include-archived] [--include-trash]  # Library as ZIP with metadata.json/.csv
bun run worker:health                         # Exit 0 if the worker's Redis heartbeat is current (container healthcheck)

# Deployment (docker-compose.yml, see README "Deployment" and the section below)
docker compose up -d --build                                    # Build image, migrate, start the stack
docker compose exec app bun run user:add <email> <pw≥16> <name> --admin
docker compose run --rm backup bash /app/scripts/backup-loop.sh --once

# Code Quality
bun run lint --type-aware  # Run OxLint
bun run astro check        # Astro project check
bunx vue-tsc --noEmit      # Type-check Vue components
bun run test               # Vitest unit and Vue interaction tests
bun run test:coverage      # Measured Istanbul coverage for Fallow
bun run e2e:smoke          # Smoke test a running instance, see README "Smoke test"
bun run fallow             # fallow audit of changed files - verdict must not be `fail`
bun run fallow:dead        # Whole-project passes: dead code,
bun run fallow:dupes       #   duplication,
bun run fallow:health      #   complexity / maintainability
```

## Architecture

### Tech Stack

- **Astro 7** - SSR framework with Node adapter (standalone mode), Rolldown-based Vite build. `patches/astro@<version>.patch` (`patchedDependencies`) makes the adapter's `writeResponse` wait for `drain` so streamed exports and files respect backpressure; re-create it with `bun patch astro` on every Astro upgrade (`src/lib/server/astro-backpressure.test.ts` fails without it). Docker build contexts must include `patches/`; the dev server is unpatched.
- **Vue 3** - Interactive components with `<script setup>`
- **TypeScript 6** - `types: ["bun"]` is required in tsconfig.json; TS 6 no longer auto-discovers `@types/*` globals
- **Better Auth** - Authentication with passkey support
- **Drizzle ORM** - PostgreSQL database via `bun:sql` driver, `pgvector` for embeddings
- **Tailwind CSS 4** - CSS-first syntax with `@theme` blocks
- **Reka UI** - Headless component primitives (shadcn-vue style)
- **Ollama + OCR service** - External HTTP services used by the worker
- **Redis** - Worker publishes progress; SSE endpoint fans it out to clients

### Key Directories

- `src/pages/` - Astro file-based routing (SSR)
- `src/pages/api/` - JSON API endpoints (documents, folders, tags, correspondents, search, events)
- `src/components/ui/` - shadcn-vue style UI components
- `src/components/documents/` - Document management Vue components
- `src/composables/` - Vue composables (filters, metadata options, processing events, search)
- `src/db/schema/` - Drizzle schema definitions (auth tables, documents, folders, tags, correspondents, jobs)
- `src/lib/` - Auth configuration and shared utilities (hashing, dedup, validation, formatting)
- `src/lib/server/` - Server-only logic: storage config, permanent deletion, file streaming, export ZIP, storage consistency check, migrations
- `src/worker/` - Background processing worker (see below)
- `scripts/` - CLI scripts (worker entrypoint, user management, sha256 backfill, embedding maintenance, backup/restore and backup scheduler (bash), storage check, export, migrations, worker healthcheck)
- `e2e/` - End-to-end smoke test: `smoke.ts` (entry, run with Bun) and `browser.ts` drive a real instance without mocks and are excluded from coverage; `config.ts`, `fixtures.ts`, `helpers.ts` are pure and unit-tested. Must not import from `src/`
- `docker/` - `Caddyfile` (production HTTPS proxy) and `init-extensions.sql` (dev compose only; in production `scripts/migrate.ts` creates the extensions)
- `uploads/` - Document file storage (not in git)
- `watch/` - Watch folder for filesystem ingest (not in git)
- `drizzle/` - Never touch this folder - auto-generated Drizzle files

### Authentication Flow

- Middleware (`src/middleware.ts`) protects all routes except those in `isPublicPath` (`src/lib/public-paths.ts`): `/login`, `/reset-password`, `/api/health` (DB-only liveness for container healthchecks, no details) and `/api/auth/*`. Add new public paths there, with a test (the middleware itself is excluded from coverage).
- Better Auth handles sessions via `src/lib/auth.ts` (server) and `src/lib/auth-client.ts` (client)
- Supports email/password + passkeys (WebAuthn)
- Authentication gates access to the instance; all authenticated users see the same shared document library
- `@peculiar/asn1-schema` is pinned via `overrides` in package.json - duplicate module instances break the WebAuthn ASN.1 decorator registry. Verify passkey login after touching auth dependencies.

### Background Worker

Started separately via `bun run worker` (`src/worker/worker-loop.ts`). It runs these concurrent responsibilities:

1. **Job queue** - polls `processing_job`, claims jobs, and runs the pipeline per document:
   text extraction (PDF) or OCR (images) → LLM analysis → embedding. Failures retry with
   backoff up to `max_attempts`.
2. **Watch folder** - ingests files dropped into `WATCH_DIR`, skipping content duplicates.
3. **Trash cleanup** - hourly, permanently removes documents trashed longer than `TRASH_RETENTION_DAYS`.
4. **Stale-job recovery** - running jobs renew `processing_job.heartbeat_at` every 30 s; jobs without a
   heartbeat for `STALE_JOB_TIMEOUT_MINUTES` (crashed/killed worker) are reset to `failed` and retried
   if attempts remain. Runs at startup and every minute. Every job-row write of a run (step, lease
   renewal, completion, failure) is guarded by the claim (`status = 'processing'` and the claimed
   `attempts`); a run whose job was reset meanwhile aborts its lease signal and stops.
5. **Worker heartbeat** - refreshes the Redis key `docura:worker:heartbeat` (TTL 30 s) for the `/system` status page.

Notes:

- LLM-derived metadata never overwrites manually set values (`IS NULL` guards); the title is the
  exception and is replaced by the LLM suggestion on every full run.
- The LLM analysis records the fields it applied as one `updated` activity (`KI-Analyse`), restricted to
  the fields it suggested and recorded in a `finally` (also when a later step fails). Recording is
  best-effort (logged), since the metadata services write outside a shared transaction; a manual edit of
  a suggested field during the analysis is attributed to `KI-Analyse`.
- Jobs have a `kind`: `full` (whole pipeline) or `embedding` (only recomputes the vector from the stored
  text). Reprocessing (`POST /api/documents/[id]/reprocess`, bulk action `reprocess`) and
  `embeddings:reembed` go through `enqueueReprocessing` in `src/db/processing-jobs.ts` (the embedding
  scripts use `src/db/embeddings.ts`).
- Changing the embedding model or dimension follows the runbook in README, "Changing the embedding model";
  the dimension lives in `EMBEDDING_DIMENSIONS` (`src/db/schema/embedding.ts`). Restart (or rebuild and redeploy,
  if the dimension changed) the web app too: search embeds queries with `OLLAMA_EMBED_MODEL`.
- Progress is published to Redis and streamed to the UI via `/api/events/processing` (SSE). Redis
  connections come from `src/lib/redis.ts` (shared by worker and app server); the `/system` probes
  live in `src/lib/server/system-status.ts`.
- Tunables live in `src/worker/config.ts`; add new ones there rather than reading `process.env` inline.

### Component Patterns

- Always prefer installing pre-built components from shadcn-vue than creating new base components yourself. Use the shadcn-vue MCP server to look up existing components and see how they are used and configured.
- All components use TypeScript with strict typing

### Data Model

Core entities:

- **`document`** - id, name, mimeType, fileSize, storagePath, sha256, folderId, correspondentId, documentDate, embedding, textContent, isFavorite, archivedAt, trashedAt, timestamps
- **`folder`** - id, name, parentId (self-referencing for nesting), timestamps
- **`correspondent`** - id, name, timestamps; case-insensitively unique via a `lower(name)` index
- **`tag`** - id, name, color, timestamps
- **`documentTag`** - many-to-many join (documentId, tagId)
- **`processingJob`** - id, documentId, status, kind (`full`/`embedding`), step, errorMessage, attempts, maxAttempts, nextRetryAt, startedAt, heartbeatAt, completedAt, timestamps
- **`documentActivity`** - append-only audit trail: id, documentId (SET NULL on delete), documentName snapshot, actorType (`user`/`system`), actorId (SET NULL on user removal), actorName snapshot, action, changes (jsonb, only for `updated`), batchId (one per request/worker call), createdAt
- Auth tables (user, session, account, passkey) are managed by Better Auth

Soft deletion: `trashedAt` marks trash, `archivedAt` marks archive. Filter both out in list queries.

Audit trail: every mutation of an audited field (name, folder, correspondent, Belegdatum, tags, favorite,
archive/trash state, upload, permanent deletion, reprocess request for a new or upgraded job) records
`documentActivity` rows in the same transaction (`src/db/activity.ts`; the LLM analysis is the best-effort
exception, see Background Worker): `withActivity(tx, ids, actor, mutate)` snapshots before and after and records
the diff, `recordActivities` inserts explicit entries. Multi-document writes lock their rows in id order
(snapshots read in chunks of `SNAPSHOT_CHUNK` ascending ids); keep new ones consistent. Routes take the actor from `actorFromLocals(locals)`
(`src/lib/server/activity-actor.ts`); the worker uses `SYSTEM_ACTORS`. Shared types, the diff and the German
labels live in `src/lib/activity.ts` / `src/lib/activity-labels.ts`; reads in `src/db/activity-feed.ts`. Scope and
limits: README, "Verlauf (Audit-Trail)".

### Document Storage

- Files stored on disk, metadata in PostgreSQL
- Path structure: `{UPLOAD_DIR}/{uuid}.{ext}`
- UUID filenames to avoid collisions; original name kept in DB
- Configurable max file size and supported types (PDF, PNG, JPG, etc.)
- `document.sha256` has a UNIQUE index and dedups both ingest paths: the upload API returns 409 with a
  reference to the existing document, the watch folder skips and logs. The column is nullable, so
  un-hashed legacy rows bypass dedup until `bun run backfill:sha256` has run.
- `UPLOAD_DIR` and storage tunables live in `src/lib/server/storage-config.ts` (`STORAGE_CONFIG`).
- Permanent deletion (`removeDocumentsPermanently`) removes the row (and records `deleted` activity) before the
  file; an interrupted deletion leaves an orphan file, which `storage:check --delete-orphans` reclaims.
- `/api/documents/[id]/file` streams with `Range`/`ETag` support; `/api/documents/export` streams a ZIP
  (`@zip.js/zip.js`, Zip64) of the selected ids or the current list filters.

## Deployment

Production runs via `docker-compose.yml` (project name `docura`, no `container_name`s so `-p` isolates test stacks); development keeps `docker-compose.dev.yml`. Details for operators are in README, "Deployment".

- `Dockerfile` - one `oven/bun:1-slim` image (floating tag: newest Bun 1.x; CI builds with `pull: true`, servers update with `docker compose build --pull`) (runs as uid 1000) for the app (default CMD), the worker (`bun scripts/worker.ts`) and the one-shot `migrate` service (`bun scripts/migrate.ts`; runs on every `up`, app and worker wait for its success). Compose runs these directly, not via `bun run <script>`, with `init: true` so SIGTERM reaches bun (as PID 1 the Astro server ignores it); the worker has `stop_grace_period: 3m` to drain jobs in flight. The build stage copies only `astro.config.mjs`, `tsconfig.json`, `public/` and `src/`; build-only packages (`@astrojs/check`, `typescript`, `tailwindcss`, `@tailwindcss/vite`) are devDependencies and not in the runtime image. Worker and scripts run from `src/` via tsconfig paths, so `src/` and `tsconfig.json` are copied into the runtime image. CI's `quality` job uses `bun-version: 1.x` to match; keep both on the same major.
- `docker/Caddyfile` - `tls internal` for `DOCURA_HOST`, plain-HTTP redirect plus root CA download at `/docura-root-ca.crt`, deliberately no HSTS. Caddy flushes SSE and streamed ZIPs (no `Content-Length`) on its own. The CA lives in the `caddy_data` volume.
- `docker-compose.yml` - app, worker and migrate share the `x-app` anchor (image, `init`, environment, `extra_hosts`). `${X:-}` passes an empty value so the code default applies; compose defaults only where the container needs another value (`OLLAMA_URL`, `BACKUP_RETENTION_COUNT`, `DOCURA_MAX_BODY_SIZE` - Caddy ignores its own default for an empty variable). How `.env` is used: README, "Deployment".
- Behind Caddy the app speaks plain HTTP: `security.allowedDomains: [{ protocol: 'https' }]` in `astro.config.mjs` makes Astro trust `X-Forwarded-Proto`/`Host`, otherwise its origin check rejects every multipart upload. It is only safe because the app is reachable solely through the proxy - never publish port 4321.
- Healthchecks: app `GET /api/health`, worker `scripts/worker-health.ts` (`probeRedis` + `summarizeHeartbeat`, exits after the probe timeout when Redis is down). `backup` runs `scripts/backup-loop.sh` (daily at `BACKUP_TIME` UTC, `--once` for a manual run); `restore` is under `profiles: ["restore"]` and prints the compose follow-up steps via `RESTORE_NEXT_STEPS`.
- CI job `docker` validates the compose file and smoke-builds the image.

Verification recipe (local ports 80/443 may be taken: use 8080/8443 and a separate project; `docura.localhost` resolves to loopback without a hosts entry):

```bash
mkdir -p /tmp/docura-prod-test/watch /tmp/docura-prod-test/backups
cat > /tmp/docura-prod-test.env <<ENV
DOCURA_HOST=docura.localhost
DOCURA_PUBLIC_URL=https://docura.localhost:8443
DOCURA_HTTP_PORT=8080
DOCURA_HTTPS_PORT=8443
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
POSTGRES_PASSWORD=test
DOCURA_WATCH_PATH=/tmp/docura-prod-test/watch
DOCURA_BACKUP_PATH=/tmp/docura-prod-test/backups
ENV
P="docker compose -p docura-prod-test --env-file /tmp/docura-prod-test.env"
$P up -d --build && $P ps -a                       # all healthy (backup running), migrate exited (0)
curl -sk https://docura.localhost:8443/api/health  # {"status":"ok","database":"ok"}
curl -skI https://docura.localhost:8443/api/health | grep -i alt-svc  # no output: HTTP/3 is off (only TCP published)
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://docura.localhost:8080/login  # 301 https://…
curl -s http://docura.localhost:8080/docura-root-ca.crt | openssl x509 -noout -subject
$P exec app bun run user:add admin@example.com 'Admin-Passw0rd!-2026' Admin --admin
$P run --rm backup bash /app/scripts/backup-loop.sh --once
$P down -v
```

Passkeys need HTTPS with an accepted chain: in Playwright, launch Chromium with `--ignore-certificate-errors-spki-list=<base64 SHA-256 of the intermediate's SPKI>` (Caddy serves leaf + intermediate, never the root) and register/log in through a CDP virtual authenticator (`WebAuthn.addVirtualAuthenticator`).

## Environment Variables

Required in `.env` (see `.env.example`; production: `.env.production.example`, which sets `DOCURA_HOST`, `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD` and lets compose derive the rest):

- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - 32-byte base64 secret
- `BETTER_AUTH_URL` - Auth callback URL
- `PASSKEY_RP_ID` - WebAuthn relying party ID
- `PASSKEY_ORIGIN` - WebAuthn origin
- `UPLOAD_DIR` - Directory for uploaded documents
- `MAX_FILE_SIZE_MB` - Max upload file size
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` - Outgoing mail (password reset)

Worker-related:

- `OLLAMA_URL` / `OLLAMA_EMBED_MODEL` / `OLLAMA_LLM_MODEL` - Embedding and LLM analysis
- `OCR_SERVICE_URL` - OCR service for image documents
- `REDIS_URL` - Pub/sub channel for processing progress
- `WATCH_DIR` / `WATCH_ENABLED` - Filesystem ingest
- `TRASH_RETENTION_DAYS` - Retention before permanent deletion (default 90; values <= 0 or invalid fall back to 90)
- `WORKER_CONCURRENCY` - Parallel job workers (default 2)
- `STALE_JOB_TIMEOUT_MINUTES` - Minutes without a job heartbeat before a running job counts as lost and is reset (default 10)

Backup, storage and export:

- `BACKUP_DIR` (default `./backups`) / `BACKUP_RETENTION_COUNT` (default 0 = keep all; compose default 14)
- `BACKUP_TIME` - Daily backup time of the compose `backup` service (HH:MM UTC, default 03:00)
- `PG_DUMP_CONTAINER` - Run pg_dump/pg_restore/psql via `docker exec` in this container (backup in dev: `docura-db`; restore takes it only from the command line)
- `STORAGE_ORPHAN_MIN_AGE_MINUTES` - Orphan files younger than this are never deleted (default 60)
- `EXPORT_MAX_DOCUMENTS` - Upper bound for a web export (default 10000, 413 above)

## Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json)

## Formatting & checks

- After applying changes, always run the linter and astro check
- Run `bun run test:coverage` and `bun run fallow` before committing; the fallow verdict must not be `fail`
- If Vue.js components were changed, ensure that the TypeScript types are correct by running `bunx vue-tsc --noEmit`
- After final changes, run the `bunx prettier --write` on changed files to ensure consistent formatting
- always use german umlaute for user facing UI texts

## Fallow

Config lives in `.fallowrc.jsonc`; shadcn-vue components (`src/components/ui/`) are excluded there. The audit gate is set to `all`: every finding in a changed file blocks, including pre-existing ones. Touching a hotspot therefore means cleaning it up in the same change - split large functions, deduplicate, or add focused tests.

Run `bun run test:coverage` to refresh `coverage/coverage-final.json` before auditing changed code. Vitest runs under Node with happy-dom; Bun-native integrations are mocked in unit tests. Without a coverage report, fallow estimates coverage from the module graph, so an untested function with cyclomatic complexity >= 5 already exceeds the default CRAP threshold (30). Colocated `*.test.ts` files that import the module lower that estimate. Prefer adding tests over raising thresholds.

A Claude Code `PreToolUse` hook (`.claude/hooks/fallow-gate.sh`, generated by `fallow hooks install --target agent`) blocks `git commit` / `git push` when `fallow audit` returns `fail`. Use `bunx --no-install fallow` for ad-hoc commands so the project-pinned version is used:

| When about to...                  | Run                                                            |
| --------------------------------- | -------------------------------------------------------------- |
| delete an "unused" export or file | `bunx --no-install fallow dead-code --trace <file>:<export>`   |
| delete an "unused" dependency     | `bunx --no-install fallow dead-code --trace-dependency <name>` |
| commit or open a PR               | `bunx --no-install fallow audit --base <ref>`                  |
| read a diff before approving it   | `bunx --no-install fallow review --base <ref> --brief`         |
| prioritize refactoring            | `bunx --no-install fallow health --hotspots --targets`         |
| consolidate duplication           | `bunx --no-install fallow dupes --trace dup:<fingerprint>`     |
| understand a finding              | `bunx --no-install fallow explain <issue-type>`                |
