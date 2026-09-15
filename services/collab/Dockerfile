# Nook collaboration service image.
# No syntax directive: use Docker's built-in Dockerfile parser.

FROM mirror.gcr.io/library/node:22-bookworm-slim AS base
WORKDIR /app

RUN npm install --global pnpm@12.4.1 --registry=https://registry.npmjs.org

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM mirror.gcr.io/library/node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    COLLAB_PORT=1234 \
    COLLAB_INTERNAL_PORT=1235 \
    COLLAB_API_BASE=http://api:5100 \
    LOG_LEVEL=info
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 1234 1235
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.COLLAB_PORT||1234)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "dist/main.js"]
