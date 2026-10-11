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
- [PostgreSQL](https://www.postgresql.org) with pgvector (development:
  `docker compose -f docker-compose.dev.yml up -d` also starts Redis and OCR)

For a production installation with Docker Compose and HTTPS see
"Deployment".

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
| `bun run db:migrate`         | Create extensions, run database migrations     |
| `bun run worker`             | Start the background processing worker         |
| `bun run worker:health`      | Exit 0 if the worker heartbeat is current      |
| `bun run embeddings:clear`   | Remove all document embeddings                 |
| `bun run embeddings:reembed` | Queue embedding jobs (`--all`: every document) |
| `bun run backup`             | Back up database and files (see "Backup")      |
| `bun run restore`            | Restore a backup (see "Restore")               |
| `bun run storage:check`      | Compare database rows with stored files        |
| `bun run export`             | Export the library as a ZIP with metadata      |
| `bun run test`               | Run unit and Vue interaction tests             |
| `bun run test:coverage`      | Generate Istanbul and LCOV coverage            |
| `bun run e2e:smoke`          | Smoke test a running instance (see below)      |
| `bun run fallow`             | Audit changes against `origin/main`            |
| `bun run fallow:health`      | Report whole-project health                    |
| `bun run lint --type-aware`  | Run OxLint                                     |
| `bun run astro check`        | Run Astro project checks                       |

## Deployment

`docker-compose.yml` runs Docura on a LAN server with HTTPS: Caddy with its
internal CA in front of the web app, PostgreSQL (pgvector), Redis, the OCR
service, the worker, a one-shot migration service and daily backups. Only Caddy
publishes ports (80 and 443). Development keeps using `docker-compose.dev.yml`
and `bun --bun run dev`.

| File                       | Purpose                                                        |
| :------------------------- | :------------------------------------------------------------- |
| `Dockerfile`               | One image for web app, worker and migrations (`oven/bun` slim) |
| `docker-compose.yml`       | The production stack                                           |
| `docker/Caddyfile`         | HTTPS (`tls internal`), HTTP→HTTPS redirect, CA download       |
| `.env.production.example`  | Template for the server's `.env`                               |
| `scripts/migrate.ts`       | Creates the extensions, applies pending migrations             |
| `scripts/worker-health.ts` | Worker healthcheck (Redis heartbeat)                           |
| `scripts/backup-loop.sh`   | Runs `backup.sh` daily at `BACKUP_TIME`                        |

### Prerequisites

- Docker Engine with Compose v2 (`docker compose`).
- [Ollama](https://ollama.com) reachable from the containers, with the
  configured models pulled (see "Ollama on the host").
- A DNS or hosts entry for `DOCURA_HOST` (e.g. `docura.lan`) pointing to the
  server's IP on every device that uses Docura. Passkeys are bound to this name;
  changing it later invalidates them.

### First start

```sh
cp .env.production.example .env
openssl rand -base64 32                  # → BETTER_AUTH_SECRET
openssl rand -base64 24 | tr -d '/+='    # → POSTGRES_PASSWORD
# set DOCURA_HOST, BETTER_AUTH_SECRET and POSTGRES_PASSWORD in .env
mkdir -p watch backups    # or DOCURA_WATCH_PATH / DOCURA_BACKUP_PATH if set
sudo chown 1000:1000 watch   # Linux only; the worker runs as uid 1000
docker compose up -d --build
docker compose ps -a      # app, worker, db, redis, ocr, caddy healthy; backup running; migrate exited (0)
```

`POSTGRES_PASSWORD` may only contain letters and digits (A-Z, a-z, 0-9): it is
inserted unencoded into `DATABASE_URL`, and compose interpolates `$`. The
`migrate` service stops with a clear message otherwise. PostgreSQL reads the
password only when the `db_data` volume is created, so changing it later in
`.env` does not change the password of an existing database.

Create the watch folder before the first start: Docker would otherwise create
it owned by root, and the worker (uid 1000) could read but not remove ingested
files, so every rescan would import them again (see "Watch folder"). The backup
directory needs no `chown`, the `backup` service runs as root.

Compose reads `.env` only to fill in `docker-compose.yml` (interpolation); it is
not passed to the containers. They get explicit variables (database, Redis and
OCR addresses, `UPLOAD_DIR=/data/uploads`, `WATCH_DIR=/data/watch`), so a
development `.env` never leaks into them. `BETTER_AUTH_URL`, `PASSKEY_ORIGIN`
and `PASSKEY_RP_ID` are derived from `DOCURA_HOST`. Optional settings left unset
or empty fall back to the application defaults.

The app container speaks plain HTTP and trusts the proxy's
`X-Forwarded-Proto`/`X-Forwarded-Host` for `https` (`security.allowedDomains` in
`astro.config.mjs`); without that, Astro's origin check would reject every
upload. It must therefore only be reachable through Caddy: never publish port
4321, or a client could forge those headers.

Create the first administrator (the password needs at least 16 characters):

```sh
docker compose exec app bun run user:add <email> <password> <name> --admin
```

`GET /api/health` (public, no details) answers `{"status":"ok","database":"ok"}`
or 503; the System page (`/system`) shows the full status.

### Trusting the certificate

Caddy issues the certificate from its own root CA ("Caddy Local Authority",
valid for 10 years). Every device must trust that root once; passkeys only work
over HTTPS with a trusted certificate. Where possible, copy it over a trusted
channel (`docker compose cp`, then `scp` to the device):

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./docura-root-ca.crt
```

Phones can instead download it from `http://<DOCURA_HOST>/docura-root-ca.crt`
(plain HTTP, since they cannot open the HTTPS site before they trust it). Plain
HTTP can be tampered with on the way, so **verify the fingerprint before
trusting the certificate**, whichever way it arrived. Print the reference value
on the server (`openssl` runs on the host; the Caddy image may not have it):

```sh
docker compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt | openssl x509 -noout -fingerprint -sha256
```

Compare it with the SHA-256 fingerprint the device shows and cancel on any
mismatch:

- macOS/Linux: `openssl x509 -noout -fingerprint -sha256 -in docura-root-ca.crt`
- Windows: `certutil -dump docura-root-ca.crt` (line `Cert Hash(sha256)`)
- iOS/iPadOS: Settings → General → VPN & Device Management → the profile → More
  Details → SHA-256
- Firefox: the "View" button in the import dialog, before ticking any trust
  box
- Android: shows no fingerprint before installing. Install it, then check it
  under Settings → Security → Encryption & credentials → Trusted credentials →
  User → the certificate, and remove it there immediately on a mismatch.
  Copying the file over a trusted channel is preferable.

Then install it:

- **macOS**:
  `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain docura-root-ca.crt`
  (or Keychain Access → System → import → "Always Trust").
- **iOS/iPadOS**: open the URL in Safari → Settings → "Profile Downloaded" →
  Install; then Settings → General → About → Certificate Trust Settings → enable
  full trust for the root.
- **Windows** (administrator shell):
  `certutil -addstore -f Root docura-root-ca.crt`.
- **Android**: Settings → Security → Encryption & credentials → Install a
  certificate → CA certificate (menu names vary by vendor).
- **Linux**:
  `sudo cp docura-root-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates`.
- **Firefox** uses its own store: Settings → Certificates → View Certificates →
  Authorities → Import (or set `security.enterprise_roots.enabled` to use the
  system store).

The CA lives in the `caddy_data` volume, including its private key
(`root.key`). Caddy's local root has no name constraints: anyone with that key
can impersonate **any** HTTPS site to every device that trusts the root. Treat
every copy of the volume as a secret (restricted permissions, encrypted
storage, never in shared or unencrypted cloud folders). **Back it up** anyway
(or never delete it): a new volume means a new CA, which every device has to
trust again. The volume name carries the project prefix (`docura_caddy_data`
for the default project name):

```sh
mkdir -m 700 -p ~/docura-secrets
docker run --rm -v docura_caddy_data:/data:ro -v ~/docura-secrets:/out alpine \
  sh -c 'umask 077 && tar czf /out/caddy_data.tgz -C /data .'
```

Move the archive off the server to encrypted storage right away; never keep it
inside the repository directory and never commit it.

The intermediate certificate renews itself weekly and needs no action. There is
deliberately no HSTS, so a device without the CA can still proceed past the
warning during setup.

### Updating

Take a backup and note the running version first, then update the whole stack:

```sh
docker compose run --rm backup bash /app/scripts/backup-loop.sh --once
git rev-parse HEAD > .docura-previous-ref   # the version to roll back to
git pull
docker compose up -d --build
docker compose logs migrate   # applied migrations, or "keine Migrationen ausstehend"
docker compose ps -a          # everything healthy again, migrate exited (0)
```

Then run the smoke test (see "Smoke test") or at least the manual checklist.

The `migrate` service runs on every `up` before app and worker start, so updates
migrate the database automatically. A failed migration keeps app and worker
stopped (`docker compose logs migrate`); see "Rolling back" to return to the
previous version. Stopping the worker can take up to 3 minutes while it
finishes running jobs (`stop_grace_period`); jobs still unfinished then are
reset after `STALE_JOB_TIMEOUT_MINUTES` and retried.
`docker compose pull --ignore-buildable` refreshes the third-party images
(Caddy, PostgreSQL, Redis).

App, worker and migrations run from the same image and therefore always have
the same version. Keep it that way: never run a newer worker against an older
app (or the other way round), they share the database schema and the job
format. Outside compose, update and restart app and worker together, after
running `bun run db:migrate`.

#### Rolling back

Restoring the database alone does not roll back: app, worker and `migrate`
would still run the new image, and its migrations would run again on the next
`up`. Check out and rebuild the previous code first, then restore the backup
taken before the update:

```sh
docker compose stop app worker
git checkout $(cat .docura-previous-ref)   # or the previous release tag
docker compose build                       # the shared app/worker/migrate image from the old code
docker compose run --rm restore /backups/docura-backup-<ts>            # checks, shows the target
docker compose run --rm restore /backups/docura-backup-<ts> --yes --force
docker compose run --rm migrate
docker compose up -d
docker compose exec app bun run storage:check
```

`restore` runs the checked-out (old) scripts. Use `up -d`, not `start`: the
existing app and worker containers still reference the new image, `up -d`
recreates them from the rebuilt one. Then run the smoke test. Once the failed
update is fixed, record the running (rolled-back) version while still on it,
then return to the branch:

```sh
git rev-parse HEAD > .docura-previous-ref && git checkout main
```

Then follow "Updating" from `git pull` on, skipping its `git rev-parse` line.

### Watch folder

The worker reads `DOCURA_WATCH_PATH` (default `./watch`) mounted at
`/data/watch`, e.g. as target of a scanner or an SMB share. App and worker run
as uid 1000, so on Linux the directory must belong to it (see "First start"):
`sudo chown -R 1000:1000 <path>`. If the worker cannot remove an imported file,
it logs `Importierte Datei konnte nicht entfernt werden`
(`docker compose logs worker`). Uploads live in the named volume `uploads`,
which needs nothing.

### Ollama on the host

The default `OLLAMA_URL` is `http://host.docker.internal:11434`; app and worker
map that name to the host (`host-gateway`, needed on Linux). Ollama must listen
on all interfaces, not only on localhost: set `OLLAMA_HOST=0.0.0.0` for the
Ollama service (Linux: `systemctl edit ollama` →
`Environment="OLLAMA_HOST=0.0.0.0"`) and keep port 11434 closed to the outside.
The System page shows whether the models are installed.

### Backups in compose

The `backup` service (PostgreSQL image, so `pg_dump` matches the server) runs
`scripts/backup.sh` daily at `BACKUP_TIME` (HH:MM, UTC, default `03:00`) and
keeps the newest `BACKUP_RETENTION_COUNT` (default 14) backups in
`DOCURA_BACKUP_PATH` (default `./backups`). It runs as root and writes
root-owned, owner-only backups (`umask 077`). A failed backup is logged
(`docker compose logs backup`) and retried the next day; when the container
starts, it removes `*.partial` directories left by an interrupted backup. Copy
the backup directory off the server regularly, together with the `caddy_data`
volume (it contains the CA private key; see "Trusting the certificate").

Manual backup:

```sh
docker compose run --rm backup bash /app/scripts/backup-loop.sh --once
```

Restore (the `restore` service is only started on demand):

```sh
docker compose stop app worker
docker compose run --rm restore /backups/docura-backup-<ts>            # checks, shows the target
docker compose run --rm restore /backups/docura-backup-<ts> --yes --force
docker compose run --rm migrate
docker compose start app worker
docker compose exec app bun run storage:check
```

After a successful restore the service prints these follow-up steps
(`RESTORE_NEXT_STEPS`) instead of the `bun run` commands for a local setup.
`--force` is needed because an existing installation has a non-empty database
and upload volume (see "Restore"). Restore extracts with the owners recorded in
the archive; for a backup made outside this stack (e.g. in development), give
the files to uid 1000 before starting app and worker:
`docker compose run --rm --entrypoint chown restore -R 1000:1000 /data/uploads`.

### Ports other than 80/443

`DOCURA_HTTP_PORT` and `DOCURA_HTTPS_PORT` are for testing only, e.g. next to
another web server: the HTTP→HTTPS redirect always targets port 443, so set
`DOCURA_PUBLIC_URL=https://<DOCURA_HOST>:<port>` (used for `BETTER_AUTH_URL` and
`PASSKEY_ORIGIN`) and open the HTTPS URL directly. Use a separate project name
for such a test stack (`docker compose -p docura-test …`) so it does not share
volumes with a real installation.

## Smoke test

`bun run e2e:smoke` drives a real Chromium through a running instance, without
mocks. Run it after every deployment and update. It signs in with password and
passkey (virtual authenticator), uploads a PDF and an image with random content
through the upload dialog, waits for processing, checks the PDF's LLM metadata,
full-text, OCR and semantic search (the PDF has to rank ahead of the run's
unrelated image), moves the PDF to the trash and restores it. It removes its
documents and its passkey, also when a step fails or the run is aborted with
Ctrl+C. Correspondents the LLM created for the test documents are not deleted
automatically, because they may already be used by other documents; the run
lists them by name for manual review under Korrespondenten. The steps are listed in
`e2e/smoke.ts`; the exit code is 0 on success, 1 on the first failed step and
130/143 after SIGINT/SIGTERM.

Prerequisites: the development dependencies (`bun install`) and Chromium for
Playwright, once per machine:

```sh
bunx playwright install chromium
```

| Variable                    | Purpose                                                                                                                |
| :-------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| `SMOKE_BASE_URL`            | Required. URL of the instance, e.g. `https://docura.lan`                                                               |
| `SMOKE_EMAIL`               | Required. E-mail of an existing user                                                                                   |
| `SMOKE_PASSWORD`            | Required. That user's password                                                                                         |
| `SMOKE_SPKI`                | Accept Caddy's private CA (see below)                                                                                  |
| `SMOKE_IGNORE_HTTPS_ERRORS` | `1` accepts any certificate; fallback without `SMOKE_SPKI`. Mutually exclusive with it: the run aborts if both are set |
| `SMOKE_TIMEOUT_SECONDS`     | Max. wait for processing (default `300`)                                                                               |

If Playwright's Chromium already trusts the Docura root CA (on macOS via the
system keychain, see "Trusting the certificate"), no certificate setting is
needed. Otherwise prefer `SMOKE_SPKI` over `SMOKE_IGNORE_HTTPS_ERRORS`: Chromium
then accepts the real certificate chain issued by Caddy's CA, but no other
invalid certificate. It is the base64-encoded SHA-256 hash of the public key
(SPKI) of Caddy's intermediate certificate:

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/intermediate.crt ./caddy-intermediate.crt
export SMOKE_SPKI=$(openssl x509 -in caddy-intermediate.crt -pubkey -noout \
  | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl base64)
```

The intermediate certificate renews itself weekly; compute the value again when
the test fails with a certificate error. Then run:

```sh
SMOKE_BASE_URL=https://docura.lan SMOKE_EMAIL=admin@example.com \
  SMOKE_PASSWORD='…' bun run e2e:smoke
```

The test needs the full stack: worker, OCR service and Ollama (LLM and
embeddings). It signs in as the given user and briefly adds a passkey to that
account; use a dedicated test user if you prefer.

### Manual checklist

The documented minimum after each deployment or update when the smoke test
cannot run:

- [ ] Sign in with e-mail and password; the browser shows a valid HTTPS
      connection.
- [ ] Add a passkey under Einstellungen (`/account`), sign out, sign in with
      the passkey.
- [ ] Upload a PDF and a photo or scan through the upload dialog.
- [ ] Both reach "Abgeschlossen" in the document list.
- [ ] Full-text search finds a word from the PDF and a word from the image;
      semantic search with a paraphrase finds the PDF.
- [ ] Move a document to the trash, find it under Papierkorb, restore it.
- [ ] Delete the test documents permanently and remove the test passkey.

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

With Docker Compose, the `backup` service runs it daily (see "Deployment",
"Backups in compose").

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
   backup is restored into newer code. Without the prefix, Bun reads
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

Migrations do not need it either: `bun run db:migrate` (`scripts/migrate.ts`)
uses Drizzle's runtime migrator for `bun:sql`, which shares the journal table
`drizzle.__drizzle_migrations` with Drizzle Kit, and creates the `vector` and
`pg_trgm` extensions first (the initial migration uses `vector` before the
migration that creates it). The same script runs in the production image.

The package exists solely because the Drizzle Kit commands that connect to the database (`db:push`, `db:studio`) require a recognized PostgreSQL driver package. Drizzle Kit does not support `bun:sql` yet; `db:generate` does not connect.

Upstream issue: [drizzle-orm#4122](https://github.com/drizzle-team/drizzle-orm/issues/4122)

This dependency can be removed once Drizzle Kit adds native Bun SQL support.

## Code quality

Run `bun run test:coverage` before `bun run fallow` so Fallow can use current
Istanbul coverage from `coverage/coverage-final.json`. Coverage output is ignored
by Git. Tests use Vitest and happy-dom; OCR client tests use Node's native web APIs.
Database, Ollama and Bun-specific integrations are mocked in unit tests, so a
passing suite does not replace an end-to-end check against running services.

GitHub Actions checks types, lint, tests, build, the strict changed-code audit,
and a whole-project health floor of 88. A second job validates
`docker-compose.yml` and smoke-builds the production image (not pushed). It publishes health, duplication,
dead-code and coverage reports as artifacts. The browser import boundary prevents
runtime dependencies on database and worker modules while permitting shared
helpers and type-only imports.
