# syntax=docker/dockerfile:1
# Build context: repository root.
#   default target (`worker`): the worker bundled by esbuild into dist/*.mjs; plain node, no node_modules.
#   `--target migrate`: the one-shot `migrate` service; only the Prisma CLI, schema and migrations.
FROM node:24-alpine AS base
RUN corepack enable
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @rinde/worker --docker

FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
# Prisma generate needs a syntactically valid URL at build time only
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @rinde/db generate \
 && pnpm --filter @rinde/worker build

FROM node:24-alpine AS migrate
WORKDIR /app
# Same versions as pnpm-lock.yaml (packages/db devDependencies).
# Then drop what only `prisma studio` / `prisma dev` load lazily (pglite, React, charts, types): ~55MB.
# Verified: `prisma migrate deploy` still applies every migration on a fresh database.
RUN npm install --omit=dev --no-package-lock --no-fund --no-audit prisma@7.10.1 dotenv@17.4.2 \
 && npm cache clean --force && rm -rf /root/.npm /tmp/* \
 && cd node_modules && rm -rf @electric-sql react-dom @visx elkjs @types csstype
COPY packages/db/prisma.config.ts ./
COPY packages/db/prisma ./prisma
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

FROM node:24-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/worker/dist ./dist
# Receipt photos volume: web (nextjs) writes, worker (node) deletes.
RUN mkdir -p /data/receipts && chmod 777 /data/receipts
USER node
# One-off jobs: `node dist/ingest.mjs`, `node dist/seed-produce.mjs`, `node dist/repair-sizes.mjs`.
CMD ["node", "dist/index.mjs"]
