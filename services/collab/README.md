# @nook/collab

Realtime collaboration service for Nook: a [Hocuspocus](https://tiptap.dev/docs/hocuspocus) (Yjs)
WebSocket server plus a headless [BlockNote](https://www.blocknotejs.org/) editor for server-side
edits and conversions. It has no database of its own — documents are loaded from and stored to the
C# backend's internal API (`/internal/documents/{nodeId}`, see `docs/contracts.md` §3).

## Ports

| Port | Env | What |
|------|-----|------|
| 1234 | `COLLAB_PORT` | Hocuspocus WebSocket at `/` (proxied publicly under `/collab`). Also `GET /healthz`. |
| 1235 | `COLLAB_INTERNAL_PORT` | Internal HTTP API (`/internal/*`, `X-Internal-Token` required) and `GET /healthz`. |

The internal API is intentionally on a **separate port** so the public `/collab` proxy (Caddy / Vite)
can never reach it; only the backend on the internal network talks to 1235.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `COLLAB_PORT` | `1234` | WebSocket port |
| `COLLAB_INTERNAL_PORT` | `1235` | Internal HTTP API port |
| `COLLAB_HOST` | `0.0.0.0` | Bind address for both listeners |
| `COLLAB_API_BASE` | `http://localhost:5100` | Backend base URL (`GET/PUT /internal/documents/{id}`) |
| `NOOK_INTERNAL_TOKEN` | — (required) | Shared secret: sent to the backend as `X-Internal-Token` and required from callers of our internal API |
| `NOOK_COLLAB_JWT_SECRET` | — (required) | HS256 secret for the collab JWT issued by `GET /api/collab/token` |
| `COLLAB_STORE_DEBOUNCE_MS` | `2000` | Debounce before persisting a changed document |
| `COLLAB_STORE_MAX_DEBOUNCE_MS` | `10000` | Upper bound: a busy document is persisted at least this often |
| `COLLAB_BACKEND_TIMEOUT_MS` | `10000` | Timeout per backend HTTP call |
| `COLLAB_SHUTDOWN_TIMEOUT_MS` | `20000` | How long a graceful shutdown waits for pending stores |
| `LOG_LEVEL` | `info` | pino level (`trace`…`fatal`, `silent`) |
| `LOG_PRETTY` | unset | `1` for human-readable logs in development |

In development (`NODE_ENV != production`) the repo-root `.env` is loaded automatically if present
(existing process variables win).

## Run

```sh
pnpm install
pnpm dev          # tsx watch, reads ../../.env
pnpm build && pnpm start
pnpm typecheck
pnpm test         # Vitest against an in-memory fake of the backend API
```

Docker: `docker build -t nook-collab .` (multi-stage, `node:22-alpine`).

## How it works

- **Auth** — `onAuthenticate` verifies the JWT (HS256, `jose`): claims `{sub, name, color, node, role}`.
  The document name must be `node:<nodeId>` and `node` must equal `<nodeId>`. `role: viewer` makes
  the connection read-only (Hocuspocus drops its updates). The context `{user:{id,name,color}, role}`
  is attached to the connection.
- **Y.Doc layout** — `getXmlFragment("document")` (BlockNote), `getText("title")`, `getMap("meta")`.
- **Load** — `onLoadDocument` → `GET /internal/documents/{id}`; `ydoc` is applied with
  `Y.applyUpdate`; `null` initialises one empty paragraph (uuid id). `version` is kept per document.
- **Store** — `onStoreDocument` (debounced) → `PUT /internal/documents/{id}` with
  `{ydoc, version, title, blocks, updates, userIds}`; `blocks` come from
  `ServerBlockNoteEditor.yXmlFragmentToBlocks`, `updates` are the incremental Y updates since the
  last store, `userIds` the authors in that batch. A `409` reloads the backend state, merges it into
  the live doc (CRDT merge, nothing is lost) and stores again. Transient failures are retried with
  backoff; if the backend stays down the document is kept in memory and re-tried on a timer, so
  edits survive an outage. Unsaved edits at shutdown are flushed (bounded by
  `COLLAB_SHUTDOWN_TIMEOUT_MS`).
- **Server-side edits** — `POST /internal/docs/{id}/ops` opens a Hocuspocus direct connection to the
  live document (loading it if needed), applies the ops on a scratch headless BlockNote editor
  (`insertBlocks` / `updateBlock` / `removeBlocks` / `replaceBlocks`) and writes the result back to
  the fragment with y-prosemirror's structural diff (`prosemirrorToYXmlFragment` → `updateYFragment`,
  the same routine the client binding uses). Connected clients receive minimal updates instantly;
  a failing op in a batch leaves the document untouched.

## Internal API

All `/internal/*` routes require `X-Internal-Token`. Errors are `{error}` with 400/401/404/502/500.

```
POST /internal/docs/{nodeId}/ops     [op, ...]                     -> {applied}
POST /internal/docs/{nodeId}/import  {title, blocks}               -> {ok, blocks}
GET  /internal/docs/{nodeId}/blocks                                -> {title, blocks}
POST /internal/convert  {from:"markdown"|"html", to:"blocks", content}
                        {from:"blocks", to:"markdown"|"html", blocks, htmlMode?:"full"|"lossy"} -> {result}
GET  /healthz                                                      -> {ok, documents, connections, dirtyDocuments}
```

Ops: `insert {blocks, referenceBlockId?, placement:"before"|"after"|"end"}`, `update {blockId, block}`,
`remove {blockIds}`, `replace {blockId, blocks}`, `setTitle {title}`. Notes:

- `insert` with `placement:"end"` (or without a reference) appends; if the document is just the single
  empty paragraph a new page starts with, that paragraph is replaced instead.
- Removing every block leaves one empty paragraph (BlockNote documents are never empty).
- Optional header `X-Nook-User-Id` attributes the change (`userIds` in the next store); default `system`.
- `GET …/blocks` serves the live document when loaded, otherwise reads the backend copy without
  loading it; a document the backend has never stored returns `{title:"", blocks:[]}`.
- `htmlMode` (extension): `full` = BlockNote render markup (default, round-trips), `lossy` = plain
  interoperable HTML.

## Tests

`pnpm test` spins up the service on random ports against an in-memory fake backend
(`test/fake-backend.ts`) and covers: concurrent editing convergence, viewer read-only, token
rejection, store payloads (blocks/title/authors/ydoc), server-side ops reaching a connected client,
409 recovery, backend downtime, import, and markdown/html conversions.
