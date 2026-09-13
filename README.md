# Nook

Personal self-hosted Notion: Notion-grade block editor, real-time collaboration for a couple of users, databases with views, knowledge graph (links/backlinks/tags), and a plugin system for integrations (AI writing, Telegram bots, spaced repetition, Obsidian import).

- Plan of record: [docs/PLAN.md](docs/PLAN.md) · Decisions: [docs/adr](docs/adr) · Service contracts: [docs/contracts.md](docs/contracts.md)
- `backend/` C# / ASP.NET Core 10 / PostgreSQL · `services/collab/` Node Yjs server · `frontend/` React 19 + BlockNote · `deploy/` docker-compose + Caddy

## Local development

```bash
cp .env.example .env            # adjust if needed
dotnet run --project backend/src/Nook.Api            # http://localhost:5100
(cd services/collab && pnpm install && pnpm dev)     # ws://localhost:1234
(cd frontend && pnpm install && pnpm dev)            # http://localhost:5173
```

## Deploy

```bash
cp deploy/.env.example deploy/.env && $EDITOR deploy/.env
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

Backups: `deploy/backup.sh /path/to/backups` (pg_dump + blob tarball).
