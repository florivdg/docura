# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Docura is a German-language shared document management system built with Astro 5, Vue 3, and Better Auth. It uses PostgreSQL (via Bun SQL) with Drizzle ORM and features passkey (WebAuthn) authentication support. All authenticated users share a single document library and can upload, organize, search, and preview documents.

## Commands

```bash
# Development
bun --bun run dev      # Start dev server at localhost:4321
bun run build          # Build for production
bun --bun run preview  # Preview production build

# Database
bun run db:generate  # Generate Drizzle migrations from schema - never run this directly
bun run db:migrate   # Run database migrations - never run this directly

# Code Quality
bun run lint --type-aware  # Run OxLint
bun run astro check        # Astro project check
```

## Architecture

### Tech Stack

- **Astro 5** - SSR framework with Node adapter (standalone mode)
- **Vue 3** - Interactive components with `<script setup>`
- **Better Auth** - Authentication with passkey support
- **Drizzle ORM** - PostgreSQL database via `bun:sql` driver
- **Tailwind CSS 4** - CSS-first syntax with `@theme` blocks
- **Reka UI** - Headless component primitives (shadcn-vue style)

### Key Directories

- `src/pages/` - Astro file-based routing (SSR)
- `src/components/ui/` - shadcn-vue style UI components
- `src/components/documents/` - Document management Vue components
- `src/db/schema/` - Drizzle schema definitions (auth tables, documents, folders, tags)
- `src/lib/` - Auth configuration and utilities
- `scripts/` - CLI scripts (migrations, user management)
- `uploads/` - Document file storage (not in git)
- `drizzle/` - Never touch this folder - auto-generated Drizzle files

### Authentication Flow

- Middleware (`src/middleware.ts`) protects all routes except `/login` and `/api/auth/*`
- Better Auth handles sessions via `src/lib/auth.ts` (server) and `src/lib/auth-client.ts` (client)
- Supports email/password + passkeys (WebAuthn)
- Authentication gates access to the instance; all authenticated users see the same shared document library

### Component Patterns

- Always prefer installing pre-built components from shadcn-vue than creating new base components yourself. Use the shadcn-vue MCP server to look up existing components and see how they are used and configured.
- All components use TypeScript with strict typing

### Data Model

Core entities:

- **`document`** - id, name, mimeType, fileSize, storagePath, folderId, timestamps
- **`folder`** - id, name, parentId (self-referencing for nesting), timestamps
- **`tag`** - id, name, color, timestamps
- **`documentTag`** - many-to-many join (documentId, tagId)
- Auth tables (user, session, account, passkey) are managed by Better Auth

### Document Storage

- Files stored on disk, metadata in PostgreSQL
- Path structure: `{UPLOAD_DIR}/{uuid}.{ext}`
- UUID filenames to avoid collisions; original name kept in DB
- Configurable max file size and supported types (PDF, PNG, JPG, etc.)

## Environment Variables

Required in `.env` (see `.env.example`):

- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - 32-byte base64 secret
- `BETTER_AUTH_URL` - Auth callback URL
- `PASSKEY_RP_ID` - WebAuthn relying party ID
- `PASSKEY_ORIGIN` - WebAuthn origin
- `UPLOAD_DIR` - Directory for uploaded documents
- `MAX_FILE_SIZE_MB` - Max upload file size

## Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json)

## Formatting & checks

- After applying changes, always run the linter and astro check
- If Vue.js components were changed, ensure that the TypeScript types are correct by running `bunx vue-tsc --noEmit`
- After final changes, run the `bunx prettier --write` on changed files to ensure consistent formatting
- always use german umlaute for user facing UI texts
