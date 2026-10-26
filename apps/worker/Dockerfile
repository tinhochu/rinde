# syntax=docker/dockerfile:1
# Build context: repository root. Also used for the one-shot `migrate` service.
FROM node:24-alpine AS base
RUN corepack enable
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @rinde/worker --docker

FROM base AS runner
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @rinde/db generate
USER node
CMD ["pnpm", "--filter", "@rinde/worker", "start"]
