# Build the SPA
FROM node:22-alpine AS web
RUN corepack enable
WORKDIR /src/frontend
COPY frontend/ .
RUN pnpm install --frozen-lockfile && pnpm build

# Build the API
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src/backend
COPY backend/ .
RUN dotnet publish src/Nook.Api/Nook.Api.csproj -c Release -o /out

# Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api /out .
COPY --from=web /src/frontend/apps/web/dist ./wwwroot
EXPOSE 5000
ENTRYPOINT ["dotnet", "Nook.Api.dll"]
