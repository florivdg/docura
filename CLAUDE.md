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
bun run db:studio    # Drizzle Studio

# Maintenance
bun run backfill:sha256  # Hash existing documents so dedup applies to the old library

# Code Quality
bun run lint --type-aware  # Run OxLint
bun run astro check        # Astro project check
bunx vue-tsc --noEmit      # Type-check Vue components
```

## Architecture

### Tech Stack

- **Astro 7** - SSR framework with Node adapter (standalone mode), Rolldown-based Vite build
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
- `src/worker/` - Background processing worker (see below)
- `scripts/` - CLI scripts (worker entrypoint, user management, sha256 backfill)
- `uploads/` - Document file storage (not in git)
- `watch/` - Watch folder for filesystem ingest (not in git)
- `drizzle/` - Never touch this folder - auto-generated Drizzle files

### Authentication Flow

- Middleware (`src/middleware.ts`) protects all routes except `/login` and `/api/auth/*`
- Better Auth handles sessions via `src/lib/auth.ts` (server) and `src/lib/auth-client.ts` (client)
- Supports email/password + passkeys (WebAuthn)
- Authentication gates access to the instance; all authenticated users see the same shared document library
- `@peculiar/asn1-schema` is pinned via `overrides` in package.json - duplicate module instances break the WebAuthn ASN.1 decorator registry. Verify passkey login after touching auth dependencies.

### Background Worker

Started separately via `bun run worker` (`src/worker/worker-loop.ts`). It runs three concurrent responsibilities:

1. **Job queue** - polls `processing_job`, claims jobs, and runs the pipeline per document:
   text extraction (PDF) or OCR (images) → LLM analysis → embedding. Failures retry with
   backoff up to `max_attempts`.
2. **Watch folder** - ingests files dropped into `WATCH_DIR`, skipping content duplicates.
3. **Trash cleanup** - hourly, permanently removes documents trashed longer than `TRASH_RETENTION_DAYS`.

Notes:

- LLM-derived metadata never overwrites manually set values (`IS NULL` guards).
- Progress is published to Redis and streamed to the UI via `/api/events/processing` (SSE).
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
- **`processingJob`** - id, documentId, status, step, errorMessage, attempts, maxAttempts, nextRetryAt, timestamps
- Auth tables (user, session, account, passkey) are managed by Better Auth

Soft deletion: `trashedAt` marks trash, `archivedAt` marks archive. Filter both out in list queries.

### Document Storage

- Files stored on disk, metadata in PostgreSQL
- Path structure: `{UPLOAD_DIR}/{uuid}.{ext}`
- UUID filenames to avoid collisions; original name kept in DB
- Configurable max file size and supported types (PDF, PNG, JPG, etc.)
- `document.sha256` has a UNIQUE index and dedups both ingest paths: the upload API returns 409 with a
  reference to the existing document, the watch folder skips and logs. The column is nullable, so
  un-hashed legacy rows bypass dedup until `bun run backfill:sha256` has run.

## Environment Variables

Required in `.env` (see `.env.example`):

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
- `TRASH_RETENTION_DAYS` - Retention before permanent deletion (default 90)
- `WORKER_CONCURRENCY` - Parallel job workers (default 2, not in `.env.example`)

## Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json)

## Formatting & checks

- After applying changes, always run the linter and astro check
- If Vue.js components were changed, ensure that the TypeScript types are correct by running `bunx vue-tsc --noEmit`
- After final changes, run the `bunx prettier --write` on changed files to ensure consistent formatting
- always use german umlaute for user facing UI texts
