# Nook — personal self-hosted Notion

Monorepo. Plan of record: `docs/PLAN.md` (copy of the approved plan). Cross-service contracts: `docs/contracts.md` — **read it before touching any API boundary; change it only via the coordinator session.**

## Layout
- `backend/` — C# / ASP.NET Core 10, onion: `Nook.Domain` → `Nook.Application` → `Nook.Infrastructure` ← `Nook.Api` (host). `Nook.Plugins.Sdk` = plugin contracts. Tests in `backend/tests`.
- `services/collab/` — Node 22 + TypeScript: Hocuspocus (Yjs) server + headless BlockNote for server-side edits. Persists through the C# internal API, has no DB of its own.
- `frontend/` — pnpm workspace: `apps/web` (React 19 + Vite + Tailwind 4 + shadcn + BlockNote), `packages/*`, `plugins/*`.
- `deploy/` — docker-compose, Caddyfile. `docs/adr/` — decisions.

## Environment (this machine)
- .NET SDK 10, Node 22 (`/opt/homebrew/bin/node`), pnpm 12. **No Docker.**
- PostgreSQL 18 (EDB) on `127.0.0.1:5432`, user `postgres`, password `123`; DBs `nook` (dev) and `nook_test` (tests). psql lives at `/Library/PostgreSQL/18/bin/psql`; set `PGGSSENCMODE=disable`. Extensions available: `pg_trgm` (yes), `vector` (no).
- Ports: API `5000`, collab `1234`, Vite dev `5173` (proxies `/api`, `/hub`, `/collab`).

## Conventions
- C#: nullable on, warnings as errors, file-scoped namespaces, Minimal APIs grouped per feature (`MapXxxEndpoints`), no Repository layer over EF Core (`IAppDbContext` in Application). Vertical slices in `Nook.Application/<Feature>/`. Every query is scoped by `WorkspaceContext` — never query `nodes` without `workspace_id`.
- TS: strict, ESM, `type` imports, no default exports for components. Tailwind + CSS variables for theming; light/dark/high-contrast via `data-theme`.
- Tests: `dotnet test` (xUnit, integration tests hit `nook_test`, each test class creates its own schema/db copy and drops it); `pnpm test` (Vitest); `pnpm e2e` (Playwright).
- Commit only when the coordinator asks. Agents do not run `git commit`/`git add`.
- Don't add dependencies with non-permissive licenses without noting it in `docs/adr/`.
