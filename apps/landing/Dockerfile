# syntax=docker/dockerfile:1
# Rinde's landing page. Build context: apps/landing.
FROM nginx:stable-alpine-slim AS build
ARG SITE_ORIGIN=https://rinde.cool.chuventures.com
ARG APP_ORIGIN=https://app.rinde.cool.chuventures.com
ARG API_ORIGIN=https://rinde-api.cool.chuventures.com
WORKDIR /src
COPY . .
RUN SITE_ORIGIN="$SITE_ORIGIN" APP_ORIGIN="$APP_ORIGIN" API_ORIGIN="$API_ORIGIN" sh build.sh /site \
 && sed "s#__APP_ORIGIN__#$APP_ORIGIN#g" nginx.conf > /default.conf

FROM nginx:stable-alpine-slim
COPY --from=build /default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site /usr/share/nginx/html
