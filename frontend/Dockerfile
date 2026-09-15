# Nook frontend image.
# The build is independent from the API and the final container only serves the SPA.

FROM mirror.gcr.io/library/node:22-bookworm-slim AS build
WORKDIR /src

RUN npm install --global pnpm@12.4.1 --registry=https://registry.npmjs.org

COPY . ./
RUN pnpm install
RUN pnpm build

FROM mirror.gcr.io/library/nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
EXPOSE 80
ENTRYPOINT ["nginx", "-g", "daemon off;"]
