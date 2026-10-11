# Changelog

## v1.0.0

[compare changes](https://github.com/florivdg/docura/compare/1541703...v1.0.0)

First stable release of Docura, a German-language shared document management system.

### 🚀 Enhancements

- **auth:** Email/password and passkey (WebAuthn) login with Better Auth, password reset by e-mail ([4352374](https://github.com/florivdg/docura/commit/4352374), [d354dbc](https://github.com/florivdg/docura/commit/d354dbc))
- **auth:** Public sign-up disabled; admin-only user management (create, ban/unban, remove, roles, set password), "Passwort ändern" on the account page, `user:add --admin`, `user:role` and `user:password` CLIs, password reset only when SMTP is configured ([#7](https://github.com/florivdg/docura/issues/7), [#14](https://github.com/florivdg/docura/pull/14))
- **documents:** Upload with SHA-256 deduplication, detail view with PDF/image preview, inline renaming, favorites, archive and trash with automatic cleanup, filters, sorting, pagination and bulk actions ([47b043b](https://github.com/florivdg/docura/commit/47b043b), [b58319f](https://github.com/florivdg/docura/commit/b58319f), [0ad19ab](https://github.com/florivdg/docura/commit/0ad19ab))
- **organization:** Hierarchical folders, colored tags, correspondents and Belegdatum ([1ce9410](https://github.com/florivdg/docura/commit/1ce9410), [1d73f0c](https://github.com/florivdg/docura/commit/1d73f0c), [0ad19ab](https://github.com/florivdg/docura/commit/0ad19ab))
- **correspondents:** Management page with active-document counts; rename, delete and transactional merge ([#11](https://github.com/florivdg/docura/issues/11), [#15](https://github.com/florivdg/docura/pull/15))
- **worker:** Background processing pipeline – PDF text extraction, OCR service (Tesseract/PaddleOCR) for images, LLM-derived title, tags, folder, correspondent and Belegdatum (never overwriting manual values), vector embeddings; watch folder ingest ([2b425ad](https://github.com/florivdg/docura/commit/2b425ad), [baed537](https://github.com/florivdg/docura/commit/baed537), [169a860](https://github.com/florivdg/docura/commit/169a860), [273f536](https://github.com/florivdg/docura/commit/273f536))
- **worker:** Recoverable processing – stuck jobs are recovered via a heartbeat lease, "Neu verarbeiten" for single documents and in bulk, System page with worker and service status, documented embedding model change (`embeddings:clear`, `embeddings:reembed`) ([#9](https://github.com/florivdg/docura/issues/9), [#16](https://github.com/florivdg/docura/pull/16))
- **search:** German full-text search and semantic vector search, command palette ([091d7ec](https://github.com/florivdg/docura/commit/091d7ec), [ba33a14](https://github.com/florivdg/docura/commit/ba33a14))
- **ui:** Real-time processing status via Redis and server-sent events; dashboard with library statistics ([733b802](https://github.com/florivdg/docura/commit/733b802), [cdd2be9](https://github.com/florivdg/docura/commit/cdd2be9))
- **data:** `backup` and `restore` scripts, `storage:check` consistency check, ZIP export of the library or a selection with metadata (JSON/CSV), streamed file downloads with range support ([#10](https://github.com/florivdg/docura/issues/10), [#17](https://github.com/florivdg/docura/pull/17))
- **deployment:** Docker Compose production setup with Caddy HTTPS (`tls internal`), automatic migrations, health checks, scheduled backups and a restore profile ([#8](https://github.com/florivdg/docura/issues/8), [#18](https://github.com/florivdg/docura/pull/18))
- **release:** Scripted end-to-end smoke test (`bun run e2e:smoke`, incl. passkey login over HTTPS), upgrade notes, UI placeholders removed ([#12](https://github.com/florivdg/docura/issues/12))

### 🩹 Fixes

- **security:** Hardened API against path traversal, CSRF, injection and MIME spoofing; input validation and safe JSON parsing ([c636d97](https://github.com/florivdg/docura/commit/c636d97), [d779eac](https://github.com/florivdg/docura/commit/d779eac))
- **worker:** LLM answers wrapped in Markdown code fences are parsed; Ollama chat retries without structured output when unsupported ([#16](https://github.com/florivdg/docura/pull/16), [fc52193](https://github.com/florivdg/docura/commit/fc52193))
- **downloads:** Downloaded files keep their file extension ([#17](https://github.com/florivdg/docura/pull/17))

### 💅 Refactors

- **worker:** Split the monolithic worker into a modular architecture ([f9d1511](https://github.com/florivdg/docura/commit/f9d1511))
- Improve code quality and enforce Fallow health checks in CI ([9128236](https://github.com/florivdg/docura/commit/9128236))

### 📦 Build

- **deps:** Astro 7, TypeScript 6 and updated dependencies; patched Astro Node adapter for write backpressure ([df6f051](https://github.com/florivdg/docura/commit/df6f051), [#17](https://github.com/florivdg/docura/pull/17))

### ❤️ Contributors

- Florian van der Galiën <hallo@flori.dev>
