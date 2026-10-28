# syntax=docker/dockerfile:1
# Rinde's landing page. Build context: repository root (Dockerfile "apps/landing/Dockerfile").
FROM node:24-alpine AS base
RUN corepack enable
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @rinde/landing --docker

FROM base AS builder
ARG SITE_ORIGIN=https://rinde.cool.chuventures.com
ARG APP_ORIGIN=https://app.rinde.cool.chuventures.com
ARG API_ORIGIN=https://rinde-api.cool.chuventures.com
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
WORKDIR /repo/apps/landing
RUN VITE_SITE_ORIGIN="$SITE_ORIGIN" VITE_APP_ORIGIN="$APP_ORIGIN" VITE_API_ORIGIN="$API_ORIGIN" pnpm build \
 && sed "s#__APP_ORIGIN__#$APP_ORIGIN#g" nginx.conf > /default.conf

# Static files only: no node in the image.
FROM nginx:stable-alpine-slim
COPY --from=builder /default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/landing/dist /usr/share/nginx/html
