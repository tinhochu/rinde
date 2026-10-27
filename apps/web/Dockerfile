# syntax=docker/dockerfile:1
# Build context: repository root. Coolify: Base Directory "/", Dockerfile "apps/web/Dockerfile".
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @rinde/web --docker

FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
# Prisma generate needs a syntactically valid URL at build time only
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm turbo run build --filter=@rinde/web

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public
# Receipt photos volume: web (nextjs) writes, worker (node) deletes.
RUN mkdir -p /data/receipts && chmod 777 /data/receipts
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
