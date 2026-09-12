# Cross-service contracts (wave 0)

Owner: coordinator session. Agents implement these exactly; if something is impossible, report it instead of changing the contract.

## 1. Identity & auth (backend ↔ frontend)

Cookie session. Cookie name `nook_session`, HttpOnly, SameSite=Lax, Secure in production. All `/api/**` require the cookie **or** `Authorization: Bearer <api-token>`; exceptions: `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/invite/{code}`, `GET /api/health`.

```
POST /api/auth/login        {email, password}                 -> 200 {user, workspaces: [WorkspaceSummary]} | 401
POST /api/auth/logout                                          -> 204
POST /api/auth/register     {inviteCode, email, password, displayName} -> 200 {user, workspaces} | 400/410
GET  /api/auth/invite/{code}                                   -> 200 {valid: bool, email?: string}
GET  /api/me                                                   -> 200 {user, workspaces}
POST /api/invites           (owner/admin only) {email?, expiresInHours?} -> 201 {code, url, expiresAt}
GET  /api/api-tokens / POST /api/api-tokens {name, scopes:["read"|"write"|"admin"]} -> 201 {id, name, token(once), scopes, createdAt}
DELETE /api/api-tokens/{id}
```

`User = {id, email, displayName, avatarUrl?, isInstanceOwner, createdAt}`.
`WorkspaceSummary = {id, name, icon?, role: "owner"|"editor"|"viewer", isPersonal}`.

Instance owner is seeded at startup from `NOOK_OWNER_EMAIL` / `NOOK_OWNER_PASSWORD` if no users exist. Registration is invite-only. Every new user gets a personal workspace automatically.

## 2. Workspaces & nodes (minimal for wave 0 — the tree agent extends in wave 1)

Every request that touches content carries the workspace: header `X-Workspace-Id: <uuid>` (frontend sets it from the active workspace). Server verifies membership or node share; missing/invalid → 403.

```
GET  /api/workspaces                         -> [WorkspaceSummary]
POST /api/workspaces      {name, icon?}       -> 201 WorkspaceSummary
GET  /api/workspaces/{id}/members            -> [{userId, email, displayName, role}]
POST /api/workspaces/{id}/members {email, role} -> 201   (owner only)
DELETE /api/workspaces/{id}/members/{userId}
GET  /api/nodes?parentId=&kind=              -> [Node]        (children of parent; parentId omitted = roots)
GET  /api/nodes/{id}                         -> Node
POST /api/nodes             {parentId?, kind:"page", title?, icon?} -> 201 Node
PATCH /api/nodes/{id}       {title?, icon?, cover?, parentId?, position?, pageSettings?} -> Node
DELETE /api/nodes/{id}                       -> 204 (soft delete; trash)
```

`Node = {id, workspaceId, parentId?, kind:"page"|"folder"|"database"|"collection_row"|"file", title, icon?: {type:"emoji"|"url"|"upload", value}, cover?: {...}, position: string (fractional index), pageSettings?: {font:"default"|"serif"|"mono", smallText, fullWidth, locked}, archivedAt?, deletedAt?, createdAt, updatedAt, effectiveRole:"owner"|"editor"|"viewer"}`.

## 3. Collab (backend ↔ collab ↔ frontend)

**Token**: `GET /api/collab/token?nodeId=<uuid>` → `200 {token, wsUrl}`. JWT HS256 signed with `NOOK_COLLAB_JWT_SECRET`, exp = 10 min, claims: `{sub: userId, name: displayName, color: "#hex", node: nodeId, role: "editor"|"viewer"}`. `wsUrl` = `/collab` (same origin; Caddy/Vite proxy → collab service).

**Hocuspocus document name** = `node:<nodeId>`. Client connects with `token` = the JWT. `onAuthenticate` verifies signature + `node` claim == document name; `role: viewer` → `connection.readOnly = true`. Awareness user = `{name, color}` from claims.

**Y.Doc layout**: `doc.getXmlFragment("document")` = BlockNote fragment; `doc.getText("title")` = page title; `doc.getMap("meta")` reserved.

**Internal API** (collab → backend). Header `X-Internal-Token: <NOOK_INTERNAL_TOKEN>`; not reachable through Caddy (only on the internal network / localhost).

```
GET /internal/documents/{nodeId}   -> 200 {ydoc: base64 | null, version: int}   (null = new document; collab initialises an empty BlockNote doc)
PUT /internal/documents/{nodeId}   {ydoc: base64, version: int, title: string, blocks: Block[], updates?: base64[] (incremental Y updates since last store, optional), userIds: string[] (authors in this batch)}
                                   -> 200 {version: int} | 409 if version < stored version (collab reloads)
```
Backend on PUT (single transaction): store ydoc + bump version; append `document_updates`; update `nodes.title`; rebuild the `blocks` projection for the node (diff by block id: unchanged rows keep `version`/`updated_at`); emit `DocumentChanged` event to outbox.

**Server-side edits** (backend → collab). Header `X-Internal-Token`.

```
POST /internal/docs/{nodeId}/ops   [{op:"insert", blocks: Block[], referenceBlockId?: string, placement:"before"|"after"|"end"}
                                    | {op:"update", blockId, block: Partial<Block>}
                                    | {op:"remove", blockIds: string[]}
                                    | {op:"replace", blockId, blocks: Block[]}
                                    | {op:"setTitle", title}]           -> 200 {applied: n}
POST /internal/docs/{nodeId}/import {title, blocks: Block[]}            -> 200   (create/replace whole doc from blocks; used by importers)
GET  /internal/docs/{nodeId}/blocks                                      -> 200 {title, blocks: Block[]}
POST /internal/convert  {from:"markdown"|"html", to:"blocks", content} | {from:"blocks", to:"markdown"|"html", blocks} -> 200 {result}
```

## 4. Block JSON (shared by all three)

BlockNote's document shape, `schemaVersion: 1`:
```ts
type Block = { id: string; type: string; props: Record<string, unknown>; content?: InlineContent[] | TableContent | undefined; children: Block[] };
type InlineContent = { type: "text"; text: string; styles: Styles } | { type: "link"; href: string; content: {type:"text";text;styles}[] } | { type: string /* custom inline e.g. "mention" */; props: Record<string, unknown> };
type Styles = { bold?: true; italic?: true; underline?: true; strike?: true; code?: true; textColor?: string; backgroundColor?: string };
```
Default block types in wave 0: `paragraph, heading(level 1-4, isToggleable), bulletListItem, numberedListItem, checkListItem, toggleListItem, quote, codeBlock, table, image, video, audio, file, divider` (+ BlockNote's `pageBreak` ignored). Custom types are registered later via plugin SDK; the backend treats unknown types as opaque and extracts text from `content` generically.

Projection table `blocks`: `(id uuid, node_id, parent_block_id null, position int, type text, props jsonb, content jsonb, schema_version int, version int, plain_text text, text_ru tsvector generated, text_en tsvector generated, updated_at)`.

## 5. Realtime (backend ↔ frontend)

SignalR hub at `/hub`. Server → client messages: `nodeChanged {node}`, `nodeDeleted {id}`, `nodeMoved {id, parentId, position}`, `presence {nodeId, users:[{id,name,color}]}`, `documentChanged {nodeId, version}`. Client → server: `watchWorkspace(workspaceId)`, `enterNode(nodeId)`, `leaveNode(nodeId)`.

## 6. Ports & dev proxy

API `http://localhost:5000` (serves `/api`, `/hub`, `/internal`, and the built SPA in production). Collab `http://localhost:1234` (WebSocket at `/` — proxied under `/collab`). Vite dev server `5173` proxies `/api`, `/hub` (ws), `/collab` (ws, rewrite to `/`). OpenAPI JSON at `GET /openapi/v1.json` (Scalar UI at `/scalar`) — frontend generates its client from it (`pnpm gen:api`, expects the API running on 5000 or reads `backend/openapi.json` checked in by the backend build).
