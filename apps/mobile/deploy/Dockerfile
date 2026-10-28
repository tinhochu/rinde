# The app's web build (PWA) served by nginx. Build context: a folder holding this Dockerfile,
# nginx.conf and dist/ (the output of `EXPO_PUBLIC_API_URL=<api url> npx expo export -p web`).
FROM nginx:stable-alpine-slim
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html
