# Nook frontend image.
# The build is independent from the API and the final container only serves the SPA.

FROM mirror.gcr.io/library/node:22-bookworm-slim AS build
WORKDIR /src

RUN npm install --global pnpm@12.4.1 --registry=https://registry.npmjs.org

# Keep dependency installation cacheable when only application sources change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/editor/package.json packages/editor/package.json
COPY packages/plugin-sdk/package.json packages/plugin-sdk/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY plugins/ai/package.json plugins/ai/package.json
COPY plugins/obsidian-import/package.json plugins/obsidian-import/package.json
COPY plugins/sample/package.json plugins/sample/package.json
RUN pnpm install --frozen-lockfile

COPY . ./
RUN pnpm build

FROM mirror.gcr.io/library/nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
EXPOSE 80
ENTRYPOINT ["nginx", "-g", "daemon off;"]
