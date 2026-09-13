# syntax=docker/dockerfile:1
# Nook collab service — Hocuspocus (Yjs) + headless BlockNote.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    COLLAB_PORT=1234 \
    COLLAB_INTERNAL_PORT=1235 \
    COLLAB_API_BASE=http://api:5000
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 1234 1235
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${COLLAB_PORT}/healthz >/dev/null || exit 1
CMD ["node", "dist/main.js"]
