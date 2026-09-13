# Nook backend

ASP.NET Core 10 host for Nook (see `docs/PLAN.md` and `docs/contracts.md` at the repo root).

```
src/Nook.Domain          entities, enums, value objects, FractionalIndex (no dependencies)
src/Nook.Application     use cases by vertical slice (Auth, Workspaces, Nodes, Collab, Documents), IAppDbContext, events
src/Nook.Infrastructure  EF Core + Npgsql model & migrations, SignalR hub, outbox dispatcher, Hangfire
src/Nook.Api             Minimal API host: auth, endpoints, OpenAPI/Scalar, static SPA, /internal, /hub, /hangfire
src/Nook.Plugins.Sdk     plugin contracts (IPlugin, IBlockTypeDefinition, IEventHandler<T>, ...)
plugins/Nook.Plugin.Sample  proof-of-wiring plugin (/api/plugins/sample/ping)
tests/Nook.UnitTests     fractional indexing, blocks projection
tests/Nook.IntegrationTests  WebApplicationFactory against a per-class PostgreSQL database
```

## Prerequisites

- .NET SDK 10
- PostgreSQL 15+ with the `pg_trgm` extension available (`nook` for dev, `nook_test` for tests)
- Configuration comes from environment variables (`NOOK_*`, see `../.env.example`). In `Development` the API also
  reads `.env` from the repo root (never overriding real environment variables).

| Variable | Purpose |
|---|---|
| `NOOK_DB` | Npgsql connection string |
| `NOOK_DATA_DIR` | blob storage directory (default `./data`): `blobs/`, `derivatives/`, `tmp/` |
| `NOOK_MAX_UPLOAD_MB` | upload size limit for `/api/files` and `/api/files/from-url` (default 512; 413 beyond) |
| `NOOK_OWNER_EMAIL` / `NOOK_OWNER_PASSWORD` | instance owner, seeded once when the `users` table is empty |
| `NOOK_COLLAB_JWT_SECRET` | HS256 secret shared with `services/collab` |
| `NOOK_INTERNAL_TOKEN` | `X-Internal-Token` for `/internal/**` (collab → backend) |
| `NOOK_PUBLIC_URL` | public origin used in invite links (defaults to the request host) |
| `NOOK_AUTO_MIGRATE` | apply migrations on startup (default: `true` in Development) |
| `NOOK_BACKGROUND_JOBS` | Hangfire server + outbox poller (default `true`) |
| `NOOK_COLLAB_WS_URL` | `wsUrl` returned by `/api/collab/token` (default `/collab`) |

## Run

```bash
cd backend
dotnet run --project src/Nook.Api          # http://localhost:5100 (launchSettings sets Development)
```

- `GET /api/health` – liveness incl. DB check
- `GET /openapi/v1.json` – OpenAPI 3 document, `GET /scalar` – interactive reference
- `/hub` – SignalR, `/hangfire` – jobs dashboard (instance owner only)
- Static SPA: put the built frontend into `src/Nook.Api/wwwroot` (index.html fallback for non-API routes).

Log in with the seeded owner (`POST /api/auth/login`), then create invites (`POST /api/invites`) for other users.

## Migrations

Migrations live in `src/Nook.Infrastructure/Persistence/Migrations` and are applied automatically on startup in
Development (or when `NOOK_AUTO_MIGRATE=true`). To add one:

```bash
dotnet tool restore
dotnet ef migrations add <Name> --project src/Nook.Infrastructure --startup-project src/Nook.Infrastructure --output-dir Persistence/Migrations
dotnet ef database update --project src/Nook.Infrastructure --startup-project src/Nook.Infrastructure
```

The design-time factory reads `NOOK_DB` from the environment or the repo-root `.env`.

## Test

```bash
dotnet test                                # unit + integration
dotnet test tests/Nook.UnitTests           # fast, no database
NOOK_TEST_DB="Host=127.0.0.1;Port=5432;Database=nook_test;Username=postgres;Password=123" dotnet test tests/Nook.IntegrationTests
```

Each integration test class creates its own database `nook_test_<id>` (via the `postgres` maintenance DB derived from
`NOOK_TEST_DB`), migrates it, and drops it afterwards.

## OpenAPI export for the frontend

```bash
scripts/export-openapi.sh        # boots the API on :5999, writes backend/openapi.json
```

## Notes for this machine

The repo lives on an SMB share: run `dotnet` commands with stdin detached (`dotnet build </dev/null`) or they can stall,
and expect builds to be slow. `NOOK_BUILD_ROOT=$HOME/.nook-build` moves `obj/`/`bin/` to the local disk
(see `Directory.Build.props`).

## Plugins

Implement `Nook.Plugins.Sdk.IPlugin` in a project under `plugins/`, reference it from `Nook.Api` and add its assembly to
`pluginAssemblies` in `Program.cs`. `ConfigureServices` registers block/property types, `IEventHandler<T>`,
importers/exporters and automation actions; `MapEndpoints` receives `/api/plugins/{id}` (authenticated);
`Jobs` are scheduled through Hangfire (queue `plugins`).
