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

## Known Workarounds

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
