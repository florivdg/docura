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

| Command                     | Action                                  |
| :-------------------------- | :-------------------------------------- |
| `bun --bun run dev`         | Start dev server at `localhost:4321`    |
| `bun run build`             | Build for production                    |
| `bun --bun run preview`     | Preview production build                |
| `bun run db:generate`       | Generate Drizzle migrations from schema |
| `bun run db:migrate`        | Run database migrations                 |
| `bun run test`              | Run unit and Vue interaction tests      |
| `bun run test:coverage`     | Generate Istanbul and LCOV coverage     |
| `bun run fallow`            | Audit changes against `origin/main`     |
| `bun run fallow:health`     | Report whole-project health             |
| `bun run lint --type-aware` | Run OxLint                              |
| `bun run astro check`       | Run Astro project checks                |

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
