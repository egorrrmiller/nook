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

API `http://localhost:5100` (serves `/api`, `/hub`, `/internal`, and the built SPA in production). Collab `http://localhost:1234` (WebSocket at `/` — proxied under `/collab`). Vite dev server `5173` proxies `/api`, `/hub` (ws), `/collab` (ws, rewrite to `/`). OpenAPI JSON at `GET /openapi/v1.json` (Scalar UI at `/scalar`) — frontend generates its client from it (`pnpm gen:api`, expects the API running on 5000 or reads `backend/openapi.json` checked in by the backend build).

---

# Wave 1 contracts (tree · files · knowledge)

Added 2026-09-13 by the coordinator. Same rules: implement exactly; report impossibilities instead of changing the contract. Everything below lives under `/api`, requires auth, and carries `X-Workspace-Id` unless stated otherwise. Errors are RFC 7807 ProblemDetails (400 validation, 403 no access, 404 not found, 409 conflict, 413 too large).

Shared shapes:

```ts
type NodeSummary = { id: string; title: string; icon?: NodeIcon | null; kind: NodeKind; parentId?: string | null };
type Breadcrumb = NodeSummary[];   // root → … → parent (self excluded)
// §2 Node gains two optional fields (backend fills them on every response that returns a Node):
//   hasChildren: boolean          — has at least one live (not deleted) child
//   properties?: PageProperties   — see §9 (null/absent when the page has none)
```

Workstream ownership (backend): `backend-tree` = §7, `backend-files` = §8, `backend-knowledge` = §9. Frontend: `frontend-shell` consumes §7 (+ covers/icons from §8), `frontend-editor` consumes §8 + history/blocks/quick-find, `frontend-knowledge` consumes §9. §10 fixes the frontend file ownership and integration slots; §11 the dev-environment conventions for parallel agents.

## 7. Tree, navigation, account (`backend-tree`)

### 7.1 Nodes

```
GET  /api/nodes?parentId=&kind=&includeArchived=   -> [Node]   (archived nodes are hidden unless includeArchived=true; trashed never listed)
GET  /api/nodes/{id}/ancestors                      -> Breadcrumb
POST /api/nodes/{id}/duplicate   {parentId?, position?}  -> 201 Node
       Deep-copies the subtree (titles get " (copy)" suffix on the root only), icons/covers/pageSettings/properties/tags,
       and page content: for each page, GET collab /internal/docs/{src}/blocks → strip block ids → POST /internal/docs/{dst}/import
       (block ids are globally unique in `blocks`). Attachments are re-linked (new attachment rows pointing at the same blob).
POST /api/nodes/{id}/archive     -> Node  (sets archivedAt on the node only; descendants inherit visibility client-side)
POST /api/nodes/{id}/unarchive   -> Node
PATCH /api/nodes/{id}            (§2) additionally accepts {pageSettings: Partial<PageSettings>} — merge, not replace.
```

### 7.2 Trash

Soft-deleted subtree roots (a node whose own parent is not deleted). Retention is the workspace setting `trash.retentionDays` (default 30); a Hangfire recurring job (`trash-purge`, hourly) permanently deletes expired items.

```
GET    /api/trash?q=&limit=50                -> [TrashItem]
POST   /api/trash/{id}/restore  {parentId?}   -> Node      (restores the whole subtree; target = parentId ?? original parent if alive ?? workspace root)
DELETE /api/trash/{id}                        -> 204       (permanent: nodes, documents, document_updates, blocks, links, snapshots, attachments rows; blobs are GC'd by §8)
DELETE /api/trash                             -> 204       (empty trash — everything the caller may edit)
TrashItem = { node: Node, deletedAt: string, originalParent?: NodeSummary | null, breadcrumb: Breadcrumb }
```

### 7.3 Favorites & recents (per user, per workspace)

```
GET    /api/favorites                    -> [{ nodeId, position: string, node: Node }]   ordered by position (fractional index)
PUT    /api/favorites/{nodeId}  {position?}  -> 200 {nodeId, position, node}   (idempotent; position omitted = append)
DELETE /api/favorites/{nodeId}           -> 204
GET    /api/recents?limit=20             -> [{ node: Node, visitedAt: string }]   newest first; trashed excluded
POST   /api/recents/{nodeId}             -> 204   (frontend records a visit when a page opens; server keeps the last 100 per user/workspace)
```

Tables: `favorites(user_id, workspace_id, node_id, position, created_at)`, `recents(user_id, workspace_id, node_id, visited_at)`.

### 7.4 Quick find (titles + aliases)

```
GET /api/search/quick?q=&limit=20&kinds=page,database   -> [QuickHit]
QuickHit = { node: Node, breadcrumb: Breadcrumb, matchedAlias?: string, score: number }
```
Ranking: exact title (ci) > prefix > `pg_trgm` similarity (`%` operator, threshold 0.2) on `nodes.title` and `aliases.value`; trashed excluded, archived last. Empty `q` returns the 20 most recently updated pages. Used by the ⌘K palette, `[[`/`@` mentions and "Move to" pickers.

### 7.5 Account, settings, workspaces

```
PATCH /api/me                 {displayName?, avatarUrl?}          -> User
POST  /api/me/password        {currentPassword, newPassword}      -> 204 | 400
GET   /api/me/settings                                            -> Record<string, unknown>   (per-user, cross-device UI prefs: theme, sidebar width, …)
PUT   /api/me/settings/{key}  {value}                             -> 204   (value: any JSON, ≤ 16 KB)
GET   /api/workspaces/{id}/settings                               -> Record<string, unknown>   (members read; owner writes)
PUT   /api/workspaces/{id}/settings/{key}  {value}                -> 204
PATCH /api/workspaces/{id}    {name?, icon?}                      -> WorkspaceSummary   (owner)
DELETE /api/workspaces/{id}                                       -> 204   (owner; refuses to delete the caller's personal workspace)
GET   /api/invites                                                -> [{code, email?, expiresAt, usedAt?, createdAt}]
DELETE /api/invites/{code}                                        -> 204
```
Storage: `settings(scope: "user"|"workspace", scope_id, key, value jsonb)` — extend the existing `settings` table.

### 7.6 Realtime additions (§5)

Server → client: `favoritesChanged {workspaceId}` (to the user's connections only), `nodeArchived {id, archivedAt}`, `nodeRestored {node}`, `trashChanged {workspaceId}`.

## 8. Files, media, link previews (`backend-files`)

Blob store: `NOOK_DATA_DIR/blobs/ab/cd/<sha256>` (immutable, deduplicated); derivatives in `NOOK_DATA_DIR/derivatives/<sha256>/<spec>.webp`. Upload limit `NOOK_MAX_UPLOAD_MB` (default 512). Mime is sniffed from content (magic bytes) and falls back to the declared type; SVG is served as `application/octet-stream` unless requested via `?download=1` (XSS). Access = attachment → node → effective role (viewer reads, editor writes).

```
POST   /api/files                 multipart/form-data: file, nodeId (required), blockId?, propertyId?, purpose?: "content"|"icon"|"cover"   -> 201 Attachment
POST   /api/files/from-url        {url, nodeId, blockId?, purpose?}   -> 201 Attachment   (server-side fetch; SSRF guard: no private/loopback/link-local IPs, http(s) only, 10 s timeout, size limit)
GET    /api/files/{id}            -> bytes; supports Range (206), ETag = sha256, Cache-Control: private, max-age=31536000; Content-Disposition inline (?download=1 → attachment; filename*)
GET    /api/files/{id}/thumb?w=   -> image/webp derivative, w ∈ {160, 320, 640, 1280, 1920} (default 640), EXIF auto-rotated, generated on first request and cached; 404 for non-images
GET    /api/files/{id}/meta       -> Attachment
DELETE /api/files/{id}            -> 204   (row only; unreferenced blobs older than 24 h are removed by the Hangfire job `blob-gc`, daily)
GET    /api/nodes/{id}/files      -> [Attachment]

Attachment = { id, nodeId, blockId?, propertyId?, purpose, filename, mime, size, sha256,
               url: "/api/files/{id}", thumbUrl?: "/api/files/{id}/thumb",   // thumbUrl only for images
               meta: { width?, height?, duration?, pages?, textExtracted?: boolean }, createdAt }
```

Header note (implemented behaviour, 2026-09-13): `GET/DELETE /api/files/{id}`, `/thumb`, `/meta` accept requests **without** `X-Workspace-Id` (browsers can't send headers for `<img>`/`<video>`/`<a>`); the workspace is taken from the attachment and membership/share/role checks still apply. `GET /api/covers` and `POST /api/links/preview` don't need the header either. Upload/from-url/`/nodes/{id}/files` require it. Hardening covers SVG, HTML/XHTML/XML/JS (served as octet-stream inline, `nosniff`, `CSP: sandbox`).

Icons/covers reference uploads by attachment id: `NodeIcon = {type:"upload", value:"<attachmentId>"}`, `NodeCover = {type:"upload"|"url"|"gallery", value, position?: number /* 0..1 vertical focus */}`. The frontend renders uploads through `/api/files/{value}` (`/thumb?w=` for icons).

```
GET /api/covers   -> [{ id, name, group: "Gradients"|"Solid"|"Nature"|"Patterns", url, thumbUrl }]   (built-in gallery shipped in wwwroot/covers, ~30 items; `NodeCover.type="gallery", value=id`)
```

Background extraction (Hangfire queue `files`, triggered on upload): image dimensions (NetVips), video/audio duration (if cheaply available from container headers; else omitted), PDF page count + text (PdfPig), DOCX text (OpenXml SDK), plain text/markdown text. Extracted text goes to `attachments.extracted_text` with generated tsvector columns `text_ru`/`text_en` (GIN) — §9 search joins on them.

Link previews (bookmark & embed blocks):

```
POST /api/links/preview   {url}   -> LinkPreview
LinkPreview = { url, finalUrl, title?, description?, imageUrl?, faviconUrl?, siteName?,
                embed?: { provider: string, html?: string, url?: string, width?: number, height?: number, aspectRatio?: number } | null,
                fetchedAt }
```
OpenGraph/Twitter meta + `<title>`; oEmbed discovery (`<link type="application/json+oembed">`) plus a built-in provider table (YouTube, Vimeo, Twitter/X, Figma, Loom, CodePen, GitHub Gist, Google Maps, Spotify, SoundCloud). Cached in `link_previews(url_hash pk, url, data jsonb, fetched_at)` for 7 days. Same SSRF guard as `from-url`. Failures return 200 with just `{url, finalUrl}` so the block still renders.

Plugin SDK addition: `IFileTextExtractor { IReadOnlyList<string> Mimes; Task<string?> ExtractAsync(Stream, CancellationToken) }` — registered via DI; the host picks the first extractor whose Mimes match.

## 9. Knowledge: links, tags, properties, search, history, export/import (`backend-knowledge`)

### 9.1 Links & backlinks (derived from the `blocks` projection; rebuilt on every store)

```
GET /api/nodes/{id}/backlinks   -> [{ sourceNode: NodeSummary, blockId?: string, kind: LinkKind, snippet: string }]   // snippet = plain text of the source block, ≤ 200 chars
GET /api/nodes/{id}/links       -> [{ targetNode?: NodeSummary | null, targetBlockId?: string, kind: LinkKind, href?: string, broken: boolean }]
GET /api/links/broken?limit=    -> [{ sourceNode: NodeSummary, blockId: string, href?: string, targetNodeId?: string }]   // target missing, trashed, or an unresolved [[wikilink]]
LinkKind = "mention" | "wikilink" | "embed" | "synced" | "relation" | "url"
```
`LinkExtractor` is extended to recognise: inline `mention` (`props.nodeId`), inline `link` whose href is `/w/{ws}/p/{nodeId}` or `nook://node/{id}` or `nook://block/{id}` (→ kind `mention` with `targetBlockId`), blocks `pageLink`/`pageEmbed`/`syncedBlock` (`props.nodeId` / `props.blockId`), unresolved `[[Title]]` (`kind: wikilink, href: "[[Title]]"`, resolved lazily by title/alias in the broken-links report), and external `http(s)` links (`kind: url`, `targetNode` null). Also `blocks.plain_text` should include the `#tag` tokens so FTS finds them.

### 9.2 Tags

```
GET    /api/tags                          -> [{ id, name, color?, count }]      (workspace-wide, sorted by name)
POST   /api/tags        {name, color?}    -> 201 Tag    (name unique ci per workspace; 409 on duplicate)
PATCH  /api/tags/{id}   {name?, color?}   -> Tag
DELETE /api/tags/{id}                     -> 204
GET    /api/nodes/{id}/tags               -> [Tag]
PUT    /api/nodes/{id}/tags {tagIds?: string[], names?: string[]}   -> [Tag]   (replaces the manual set; unknown names are created)
GET    /api/tags/{id}/nodes?limit=&cursor=   -> { items: [Node], nextCursor? }
```
Inline `#hashtag` tokens in block text (unicode letters/digits/_/-, ≥ 2 chars, not inside code) are collected on each store and stored as `node_tags(node_id, tag_id, source: "manual"|"inline")`; `GET /nodes/{id}/tags` returns the union with `source`. Removing an inline tag from text removes the inline row only.

### 9.3 Page properties (frontmatter-style, free-form pages; wave 2 collections replace them for collection rows)

```
PageProperties = Record<string /* property name */, PageProperty>
PageProperty  = { type: "text" | "number" | "checkbox" | "date" | "select" | "multi_select" | "url" | "email" | "phone",
                  value: string | number | boolean | string[] | { start: string, end?: string } | null }
GET   /api/nodes/{id}/properties           -> PageProperties
PUT   /api/nodes/{id}/properties  PageProperties   -> PageProperties   (replace)
PATCH /api/nodes/{id}/properties  Partial<Record<string, PageProperty | null>>   -> PageProperties   (merge; null removes)
```
Stored in `nodes.properties` (jsonb, GIN). Changes emit `nodeChanged` (Node carries `properties`). Values are validated by type (dates ISO-8601).

### 9.4 Aliases

```
GET /api/nodes/{id}/aliases              -> string[]
PUT /api/nodes/{id}/aliases  {aliases: string[]}   -> string[]   (unique ci per workspace across nodes; 409 lists the conflicting node)
```

### 9.5 Full-text search

```
POST /api/search
  { query: string,
    scope?:   { ancestorId?: string },
    filters?: { titleOnly?: boolean, kinds?: NodeKind[], tagIds?: string[], createdFrom?, createdTo?, updatedFrom?, updatedTo?, includeArchived?: boolean, includeFiles?: boolean },
    sort?:    "relevance" | "updated" | "created",
    limit?:   number (default 20, max 100), cursor?: string }
  -> { hits: SearchHit[], nextCursor?: string, total: number }
SearchHit = { node: Node, breadcrumb: Breadcrumb, blockId?: string, attachment?: Attachment,
              snippet: string /* ts_headline with <mark>…</mark>, ≤ 300 chars */, score: number, matchedIn: "title" | "content" | "file" | "alias" }
```
Query grammar: whitespace-separated terms are AND-ed with prefix matching (`websearch_to_tsquery` semantics), `"quoted phrase"` is a phrase, `-term` excludes, `title:foo` restricts to titles. Both configurations are searched: `text_ru @@ q_ru OR text_en @@ q_en`, ranked by `ts_rank_cd(text_ru, q_ru) + ts_rank_cd(text_en, q_en)`, plus a title boost (trgm similarity × 2). Sources: `nodes.title`, `aliases`, `blocks.plain_text`, and (`includeFiles`) `attachments.extracted_text`. Trashed nodes excluded; archived excluded unless requested. Results are collapsed to one hit per node (best block) unless `titleOnly=false` and the caller passes `filters.perBlock=true` (optional extension).

### 9.6 Graph

```
GET /api/graph?rootId=&depth=2&includeTags=true   -> { nodes: [{ id, title, icon?, kind, degree: number, tagIds?: string[] }], edges: [{ source, target, kind: LinkKind | "tag" | "parent" }] }
```
Without `rootId`: the whole workspace (capped at 2 000 nodes; `truncated: true` when capped). Includes parent→child edges as kind `parent` so the sidebar tree and link graph render together.

### 9.7 Page history & block reads

```
GET  /api/nodes/{id}/history?limit=50&cursor=     -> { items: [Version], nextCursor? }
GET  /api/nodes/{id}/history/{versionId}          -> { title, blocks: Block[], takenAt, user? }
POST /api/nodes/{id}/history                      -> 201 Version   (manual "Save version": snapshot of the current projection)
POST /api/nodes/{id}/history/{versionId}/restore  -> 200 { version: number }   (snapshots the current state first, then collab `POST /internal/docs/{id}/import`)
Version = { id: string, version: number, takenAt: string, user?: { id, displayName } | null, title: string, blockCount: number, kind: "auto" | "manual" | "pre-restore" }
GET  /api/nodes/{id}/blocks                       -> { title, blocks: Block[], version: number }   (current projection as a tree; used for read-only rendering when collab is down, page/block embeds, previews)
GET  /api/blocks/{blockId}                        -> { nodeId, block: Block, breadcrumb: Breadcrumb }   (block anchors)
```
Automatic snapshots: every 25 stores (existing) **and** at most once per 10 minutes of activity per page (whichever first). Diffs are computed client-side from two versions.

### 9.8 Export & import

```
POST /api/export   { nodeIds: string[], includeChildren: boolean, format: "markdown" | "html", includeFiles: boolean }
     -> 200 application/zip (streamed; Content-Disposition attachment; filename "<title or workspace>-export.zip")
     Layout follows Notion: `<Title>.md` next to a folder `<Title>/` for children; frontmatter (`title`, `tags`, `properties`, `aliases`, `created`, `updated`, `id`);
     internal links rewritten to relative paths (`[Title](../Title.md#block-id)`), attachments under `files/<sha8>-<name>` when includeFiles; HTML export inlines a minimal stylesheet.
     Block → markdown/html conversion is done by collab `POST /internal/convert` (from:"blocks"); custom block types fall back to `IBlockTypeDefinition.RenderMarkdown/RenderHtml`.
POST /api/import   multipart: file (.md | .markdown | .txt | .html | .csv | .zip), parentId?
     -> 200 { pagesCreated: number, nodeIds: string[], warnings: string[] }
     .zip: folders → parent pages (a folder with a sibling `<Name>.md` merges into that page), `.md`/`.html` → pages via collab convert + `/internal/docs/{id}/import`,
     images referenced relatively → attachments (§8 blob store) and rewritten `image` blocks, links between imported files → mentions;
     .csv → one page with a `table` block (≤ 1 000 rows; larger → warning + truncation). Runs as a Hangfire job when the archive > 20 MB
     (then returns 202 { jobId } and the client polls GET /api/import/{jobId} -> { status, result? }).
```
Both go through `IImporter`/`IExporter` from `Nook.Plugins.Sdk` (built-in implementations `markdown`, `html`, `csv`, `zip`) so the Obsidian plugin can reuse them in wave 2.

### 9.9 Realtime additions (§5)

`tagsChanged {nodeId, tags: Tag[]}`, `linksChanged {nodeId}` (after a store that changed the link set — throttle 2 s), `historyChanged {nodeId}`.

## 10. Frontend ownership & integration slots

| Area | Owner | Paths (create/modify only here) |
|---|---|---|
| Shell: sidebar (DnD tree, sections, favorites, recents, trash, archive), top bar, breadcrumbs with sibling dropdown, in-app tabs, ⌘K palette (quick find + commands), settings screens, icon/cover pickers, page `⋯` menu, keyboard shortcuts, realtime cache sync | `frontend-shell` | `apps/web/src/components/{shell,tree,settings,pickers}/**`, `apps/web/src/routes/**` (except `*.graph.tsx`), `apps/web/src/stores/**`, `apps/web/src/features/{nodes,tree,favorites,recents,trash,settings}/**`, `apps/web/src/lib/**`, `apps/web/src/app/**`, `apps/web/src/mocks/handlers/tree.ts`, `apps/web/e2e/shell*.spec.ts`, `packages/ui/**` |
| Editor: BlockNote schema & all §1.1 blocks, inline mentions `[[`/`@`, uploads & viewers, paste handling, page header (cover/icon/title area **inside** the page), page settings applied, history panel, word count, block anchors | `frontend-editor` | `packages/editor/**`, `apps/web/src/components/page/**`, `apps/web/src/features/{files,history}/**`, `apps/web/src/mocks/handlers/files.ts`, `apps/web/e2e/editor*.spec.ts` |
| Knowledge: properties bar, tags UI, backlinks panel, search dialog (full-text with filters), graph route, export/import dialogs, broken-links view | `frontend-knowledge` | `apps/web/src/features/knowledge/**`, `apps/web/src/routes/_app.w.$workspaceId.graph.tsx`, `apps/web/src/mocks/handlers/knowledge.ts`, `apps/web/e2e/knowledge*.spec.ts` |
| Shared, coordinator-owned (extend only via the coordinator): | — | `packages/api-client/**` (typed client for §1–§9; pre-written), `packages/plugin-sdk/**`, `apps/web/src/mocks/{db,handlers/core}.ts` (agents may **add** state fields/handlers in their own handler file; `db.ts` gets the fields listed in §11.3 up front) |

Integration slots (already stubbed; signatures are fixed):

```ts
// apps/web/src/features/knowledge/index.ts  (frontend-knowledge implements)
export function PageProperties(p: { workspaceId: string; nodeId: string; readOnly?: boolean }): JSX.Element | null;  // rendered by PageView under the title
export function BacklinksPanel(p: { workspaceId: string; nodeId: string }): JSX.Element;                              // inspector tab "Backlinks"
export function SearchDialog(p: { workspaceId: string; open: boolean; onOpenChange: (o: boolean) => void; initialQuery?: string }): JSX.Element;
export function ExportDialog(p: { workspaceId: string; nodeIds: string[]; open: boolean; onOpenChange: (o: boolean) => void }): JSX.Element;
export function ImportDialog(p: { workspaceId: string; parentId?: string | null; open: boolean; onOpenChange: (o: boolean) => void }): JSX.Element;
export function TagChips(p: { workspaceId: string; nodeId: string; compact?: boolean }): JSX.Element | null;         // sidebar/tree hover, palette rows

// apps/web/src/features/history/index.ts  (frontend-editor implements)
export function PageHistoryPanel(p: { workspaceId: string; nodeId: string }): JSX.Element;                            // inspector tab "History"

// apps/web/src/components/page/PageView.tsx (frontend-editor) renders, top to bottom:
//   <PageCover/> (own), header: icon + title (own; icon/cover *pickers* are imported from components/pickers — frontend-shell),
//   <PageProperties/>, <NookEditor/>, and — when useUiStore().inspector !== null — a right-hand inspector with tabs
//   Backlinks (BacklinksPanel) | History (PageHistoryPanel) | Info (own: word count, created/updated, id, copy link).
// stores/ui.ts (frontend-shell) already exposes: inspector: 'backlinks'|'history'|'info'|null, setInspector(), searchOpen, setSearchOpen().

// components/pickers/index.ts (frontend-shell implements; used by PageView header)
export function IconPicker(p: { value: NodeIcon | null | undefined; nodeId: string; onChange: (icon: NodeIcon | null) => void; children: ReactNode }): JSX.Element;   // popover: Emoji | Upload | Link tabs
export function CoverPicker(p: { value: NodeCover | null | undefined; nodeId: string; onChange: (cover: NodeCover | null) => void; children: ReactNode }): JSX.Element; // Gallery | Upload | Link | Reposition
```

Routing conventions: page `/w/$workspaceId/p/$nodeId`, block anchor `…/p/$nodeId#b-<blockId>`, graph `/w/$workspaceId/graph`, trash `/w/$workspaceId/trash`, settings `/w/$workspaceId/settings/{account|appearance|workspace|members|tokens|import-export}`. Internal link hrefs written by the editor: `/w/{ws}/p/{nodeId}` (page) and `/w/{ws}/p/{nodeId}#b-{blockId}` (block) — `LinkExtractor` (§9.1) parses both.

## 11. Parallel-agent dev environment

11.1 **Worktrees.** Each agent works in `~/nook-ws/<name>` on branch `ws/<name>` (created by the coordinator), never in `~/nook-local`. `.env` is copied per worktree with a private dev DB (`NOOK_DB=…Database=nook_<name>`) and private ports; integration tests already use throw-away databases `nook_test_<random>`.

| Agent | API port | Collab ws/internal | Vite |
|---|---|---|---|
| backend-tree | 5101 | — | — |
| backend-files | 5102 | — | — |
| backend-knowledge | 5103 | 1244 / 1245 (`COLLAB_API_BASE=http://127.0.0.1:5103`) | — |
| frontend-shell | mock (MSW) | — | 5174 |
| frontend-editor | mock (MSW) | — | 5175 |
| frontend-knowledge | mock (MSW) | — | 5176 |

Run the API on a custom port with `ASPNETCORE_URLS=http://127.0.0.1:<port> dotnet run --project src/Nook.Api --no-launch-profile` (plus `ASPNETCORE_ENVIRONMENT=Development`). Vite: `pnpm --filter @nook/web exec vite --port <port>` with `VITE_MOCK=1`.

11.2 **Migrations.** Each backend agent adds exactly one migration named `Wave1<Tree|Files|Knowledge>` and never edits another agent's migration or hand-edits the model snapshot; the coordinator squashes the three into one `Wave1` migration at merge time. Entity configuration goes in `AppDbContext.OnModelCreating` in a clearly delimited block per workstream (`// --- wave1: <name> ---`). New DTOs go in a new file per slice (`Nook.Application/<Slice>/<Slice>Dtos.cs`), not in `Contracts/Dtos.cs`. Endpoints: one `Map<Slice>Endpoints` per slice, registered in `Program.cs` in the `api.Map…` list.

11.3 **Frontend mocks.** `apps/web/src/mocks/db.ts` (`MockState`) already contains the state slices `favorites`, `recents`, `attachments`, `tags`, `nodeTags`, `snapshots`, `links`, `settings`, `aliases`, `linkPreviews`; `mocks/handlers/index.ts` composes `core`, `tree`, `files`, `knowledge`. Agents fill their own handler file and may add helper functions to `db.ts` **below the marker comment for their slice**.

11.4 **Verification per agent.** Backend: `dotnet build` (0 warnings), `dotnet test` green, manual curl pass against the private dev DB, `backend/scripts/export-openapi.sh` regenerates `backend/openapi.json`. Frontend: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e` (mock mode, own spec files), and a screenshot walkthrough in the built-in browser. Agents do **not** run `git add/commit`; they end with a report (done / verified how / not done / contract issues).
