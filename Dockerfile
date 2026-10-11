# syntax=docker/dockerfile:1
# Docura production image: web app (default command), worker and migrator.
# Debian slim (glibc) because rolldown and oxlint ship glibc-native binaries;
# not distroless, `docker compose exec app bun run user:add …` needs a shell.

FROM oven/bun:1.4.3-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
# bun install applies patches/ (patchedDependencies) and fails without it.
COPY patches ./patches
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM deps AS build
# Only what `astro build` reads, so docs, scripts and tests keep the cache.
COPY astro.config.mjs tsconfig.json ./
COPY public ./public
COPY src ./src
RUN bun run build

FROM oven/bun:1.4.3-slim AS runtime
WORKDIR /app
# The Node adapter listens on localhost unless HOST is set.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY package.json bun.lock ./
COPY patches ./patches
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
# Worker and CLI scripts run from source (tsconfig paths resolve `@/`).
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./
RUN mkdir -p /data/uploads /data/watch && chown -R bun:bun /data
USER bun
EXPOSE 4321
CMD ["bun", "./dist/server/entry.mjs"]
