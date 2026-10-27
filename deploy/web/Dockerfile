# Production image for the frontend: build the static bundle, serve it with nginx,
# and reverse-proxy /api/ to the backend container (same origin, so no CORS).
# Build context is the repository root (see docker-compose.prod.yml).

FROM node:20-alpine AS build
ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG VITE_API_BASE_URL=/api
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm config set registry "$NPM_REGISTRY" && npm ci --no-audit --no-fund
COPY frontend/ ./
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
