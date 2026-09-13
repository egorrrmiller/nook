import { createHttp, type ApiConfig } from './http';
import type {
  AddFavoriteRequest,
  AddMemberRequest,
  ApiToken,
  Attachment,
  AuthResponse,
  Backlink,
  BlockAnchor,
  Breadcrumb,
  BrokenLink,
  ChangePasswordRequest,
  CollabToken,
  CoverItem,
  CreateApiTokenRequest,
  CreateInviteRequest,
  CreateNodeRequest,
  CreateTagRequest,
  CreateWorkspaceRequest,
  CursorPage,
  CursorQuery,
  DuplicateNodeRequest,
  ExportRequest,
  Favorite,
  FileFromUrlRequest,
  GraphQuery,
  GraphResponse,
  HistoryEntry,
  HistoryPage,
  ImportJobStatus,
  ImportOptions,
  ImportResponse,
  Invite,
  InviteInfo,
  InviteListItem,
  LinkPreview,
  ListNodesQuery,
  LoginRequest,
  Node,
  NodeBlocks,
  NodeTag,
  OutgoingLink,
  PageProperties,
  PatchPagePropertiesRequest,
  QuickFindQuery,
  QuickHit,
  Recent,
  RegisterRequest,
  RestoreTrashRequest,
  RestoreVersionResponse,
  SearchRequest,
  SearchResponse,
  SetNodeTagsRequest,
  Tag,
  ThumbWidth,
  TrashItem,
  TrashListQuery,
  UpdateMeRequest,
  UpdateNodeRequest,
  UpdateTagRequest,
  UpdateWorkspaceRequest,
  UploadFileOptions,
  UserSettings,
  Version,
  WorkspaceMember,
  WorkspaceSettings,
  WorkspaceSummary,
} from './types';

/**
 * Typed client for docs/contracts.md §1–§9. Every method maps 1:1 onto a contract line;
 * paths are spelled exactly as in the contract. Namespaces:
 *
 *   auth        §1   login / logout / register / invite
 *   me          §1 + §7.5   me() plus me.update, me.changePassword, me.settings.{get,set}
 *   invites     §1 + §7.5   create, list, remove
 *   apiTokens   §1
 *   workspaces  §2 + §7.5   list, create, members, addMember, removeMember, update, remove, settings.{get,set}
 *   nodes       §2 + §7.1 + §8 + §9   crud, ancestors, duplicate, archive, unarchive, files, backlinks, links,
 *               tags/setTags, properties/setProperties/patchProperties, aliases/setAliases,
 *               history/historyVersion/saveVersion/restoreVersion, blocks
 *   trash       §7.2   list, restore, purge, empty
 *   favorites   §7.3   list, add, remove
 *   recents     §7.3   list, record
 *   search      §7.4 + §9.5   quick, full
 *   files       §8     upload, fromUrl, meta, remove, url, thumbUrl
 *   covers      §8     list
 *   links       §8 + §9.1   preview, broken
 *   tags        §9.2   list, create, update, remove, nodes
 *   graph       §9.6   get
 *   blocks      §9.7   get
 *   exportZip   §9.8   → Blob
 *   importFile  §9.8   multipart; importStatus for the 202 job path
 *   collab      §3
 *   health      §1
 */
export function createApiClient(config: ApiConfig) {
  const http = createHttp(config);
  const enc = encodeURIComponent;

  const me = Object.assign(
    (signal?: AbortSignal) => http<AuthResponse>('GET', '/api/me', { noWorkspace: true, signal }),
    {
      /** §7.5 `PATCH /api/me` */
      update: (body: UpdateMeRequest) =>
        http<AuthResponse['user']>('PATCH', '/api/me', { body, noWorkspace: true }),
      /** §7.5 `POST /api/me/password` */
      changePassword: (body: ChangePasswordRequest) =>
        http<void>('POST', '/api/me/password', { body, noWorkspace: true }),
      settings: {
        /** §7.5 `GET /api/me/settings` */
        get: (signal?: AbortSignal) =>
          http<UserSettings>('GET', '/api/me/settings', { noWorkspace: true, signal }),
        /** §7.5 `PUT /api/me/settings/{key}` */
        set: (key: string, value: unknown) =>
          http<void>('PUT', `/api/me/settings/${enc(key)}`, { body: { value }, noWorkspace: true }),
      },
    },
  );

  return {
    config,
    auth: {
      login: (body: LoginRequest) =>
        http<AuthResponse>('POST', '/api/auth/login', { body, noWorkspace: true }),
      logout: () => http<void>('POST', '/api/auth/logout', { noWorkspace: true }),
      register: (body: RegisterRequest) =>
        http<AuthResponse>('POST', '/api/auth/register', { body, noWorkspace: true }),
      invite: (code: string) =>
        http<InviteInfo>('GET', `/api/auth/invite/${enc(code)}`, {
          noWorkspace: true,
        }),
    },
    me,
    invites: {
      create: (body: CreateInviteRequest) => http<Invite>('POST', '/api/invites', { body }),
      /** §7.5 `GET /api/invites` */
      list: (signal?: AbortSignal) => http<InviteListItem[]>('GET', '/api/invites', { signal }),
      /** §7.5 `DELETE /api/invites/{code}` */
      remove: (code: string) => http<void>('DELETE', `/api/invites/${enc(code)}`),
    },
    apiTokens: {
      list: () => http<ApiToken[]>('GET', '/api/api-tokens'),
      create: (body: CreateApiTokenRequest) => http<ApiToken>('POST', '/api/api-tokens', { body }),
      remove: (id: string) => http<void>('DELETE', `/api/api-tokens/${id}`),
    },
    workspaces: {
      list: () => http<WorkspaceSummary[]>('GET', '/api/workspaces', { noWorkspace: true }),
      create: (body: CreateWorkspaceRequest) =>
        http<WorkspaceSummary>('POST', '/api/workspaces', { body, noWorkspace: true }),
      members: (id: string) => http<WorkspaceMember[]>('GET', `/api/workspaces/${id}/members`),
      addMember: (id: string, body: AddMemberRequest) =>
        http<WorkspaceMember>('POST', `/api/workspaces/${id}/members`, { body }),
      removeMember: (id: string, userId: string) =>
        http<void>('DELETE', `/api/workspaces/${id}/members/${userId}`),
      /** §7.5 `PATCH /api/workspaces/{id}` (owner) */
      update: (id: string, body: UpdateWorkspaceRequest) =>
        http<WorkspaceSummary>('PATCH', `/api/workspaces/${id}`, { body, noWorkspace: true }),
      /** §7.5 `DELETE /api/workspaces/{id}` (owner; refuses the personal workspace) */
      remove: (id: string) => http<void>('DELETE', `/api/workspaces/${id}`, { noWorkspace: true }),
      settings: {
        /** §7.5 `GET /api/workspaces/{id}/settings` */
        get: (id: string, signal?: AbortSignal) =>
          http<WorkspaceSettings>('GET', `/api/workspaces/${id}/settings`, { signal }),
        /** §7.5 `PUT /api/workspaces/{id}/settings/{key}` (owner) */
        set: (id: string, key: string, value: unknown) =>
          http<void>('PUT', `/api/workspaces/${id}/settings/${enc(key)}`, { body: { value } }),
      },
    },
    nodes: {
      list: (query: ListNodesQuery = {}, signal?: AbortSignal) =>
        http<Node[]>('GET', '/api/nodes', { query: { ...query }, signal }),
      get: (id: string, signal?: AbortSignal) => http<Node>('GET', `/api/nodes/${id}`, { signal }),
      create: (body: CreateNodeRequest) => http<Node>('POST', '/api/nodes', { body }),
      update: (id: string, body: UpdateNodeRequest) =>
        http<Node>('PATCH', `/api/nodes/${id}`, { body }),
      remove: (id: string) => http<void>('DELETE', `/api/nodes/${id}`),

      // --- §7.1
      /** `GET /api/nodes/{id}/ancestors` → root … parent */
      ancestors: (id: string, signal?: AbortSignal) =>
        http<Breadcrumb>('GET', `/api/nodes/${id}/ancestors`, { signal }),
      /** `POST /api/nodes/{id}/duplicate` — deep copy of the subtree */
      duplicate: (id: string, body: DuplicateNodeRequest = {}) =>
        http<Node>('POST', `/api/nodes/${id}/duplicate`, { body }),
      /** `POST /api/nodes/{id}/archive` */
      archive: (id: string) => http<Node>('POST', `/api/nodes/${id}/archive`),
      /** `POST /api/nodes/{id}/unarchive` */
      unarchive: (id: string) => http<Node>('POST', `/api/nodes/${id}/unarchive`),

      // --- §8
      /** `GET /api/nodes/{id}/files` */
      files: (id: string, signal?: AbortSignal) =>
        http<Attachment[]>('GET', `/api/nodes/${id}/files`, { signal }),

      // --- §9.1
      /** `GET /api/nodes/{id}/backlinks` */
      backlinks: (id: string, signal?: AbortSignal) =>
        http<Backlink[]>('GET', `/api/nodes/${id}/backlinks`, { signal }),
      /** `GET /api/nodes/{id}/links` — outgoing links */
      links: (id: string, signal?: AbortSignal) =>
        http<OutgoingLink[]>('GET', `/api/nodes/${id}/links`, { signal }),

      // --- §9.2
      /** `GET /api/nodes/{id}/tags` — manual ∪ inline, each with `source` */
      tags: (id: string, signal?: AbortSignal) =>
        http<NodeTag[]>('GET', `/api/nodes/${id}/tags`, { signal }),
      /** `PUT /api/nodes/{id}/tags` — replaces the manual set; unknown names are created */
      setTags: (id: string, body: SetNodeTagsRequest) =>
        http<Tag[]>('PUT', `/api/nodes/${id}/tags`, { body }),

      // --- §9.3
      /** `GET /api/nodes/{id}/properties` */
      properties: (id: string, signal?: AbortSignal) =>
        http<PageProperties>('GET', `/api/nodes/${id}/properties`, { signal }),
      /** `PUT /api/nodes/{id}/properties` — replace */
      setProperties: (id: string, body: PageProperties) =>
        http<PageProperties>('PUT', `/api/nodes/${id}/properties`, { body }),
      /** `PATCH /api/nodes/{id}/properties` — merge; `null` removes */
      patchProperties: (id: string, body: PatchPagePropertiesRequest) =>
        http<PageProperties>('PATCH', `/api/nodes/${id}/properties`, { body }),

      // --- §9.4
      /** `GET /api/nodes/{id}/aliases` */
      aliases: (id: string, signal?: AbortSignal) =>
        http<string[]>('GET', `/api/nodes/${id}/aliases`, { signal }),
      /** `PUT /api/nodes/{id}/aliases` — 409 lists the conflicting node */
      setAliases: (id: string, aliases: string[]) =>
        http<string[]>('PUT', `/api/nodes/${id}/aliases`, { body: { aliases } }),

      // --- §9.7
      /** `GET /api/nodes/{id}/history?limit=&cursor=` */
      history: (id: string, query: CursorQuery = {}, signal?: AbortSignal) =>
        http<HistoryPage>('GET', `/api/nodes/${id}/history`, { query: { ...query }, signal }),
      /** `GET /api/nodes/{id}/history/{versionId}` */
      historyVersion: (id: string, versionId: string, signal?: AbortSignal) =>
        http<HistoryEntry>('GET', `/api/nodes/${id}/history/${versionId}`, { signal }),
      /** `POST /api/nodes/{id}/history` — manual "Save version" */
      saveVersion: (id: string) => http<Version>('POST', `/api/nodes/${id}/history`),
      /** `POST /api/nodes/{id}/history/{versionId}/restore` */
      restoreVersion: (id: string, versionId: string) =>
        http<RestoreVersionResponse>('POST', `/api/nodes/${id}/history/${versionId}/restore`),
      /** `GET /api/nodes/{id}/blocks` — current projection as a tree */
      blocks: (id: string, signal?: AbortSignal) =>
        http<NodeBlocks>('GET', `/api/nodes/${id}/blocks`, { signal }),
    },
    /** §7.2 */
    trash: {
      /** `GET /api/trash?q=&limit=50` */
      list: (query: TrashListQuery = {}, signal?: AbortSignal) =>
        http<TrashItem[]>('GET', '/api/trash', { query: { ...query }, signal }),
      /** `POST /api/trash/{id}/restore` — whole subtree */
      restore: (id: string, body: RestoreTrashRequest = {}) =>
        http<Node>('POST', `/api/trash/${id}/restore`, { body }),
      /** `DELETE /api/trash/{id}` — permanent */
      purge: (id: string) => http<void>('DELETE', `/api/trash/${id}`),
      /** `DELETE /api/trash` — empty trash */
      empty: () => http<void>('DELETE', '/api/trash'),
    },
    /** §7.3 */
    favorites: {
      /** `GET /api/favorites` — ordered by position */
      list: (signal?: AbortSignal) => http<Favorite[]>('GET', '/api/favorites', { signal }),
      /** `PUT /api/favorites/{nodeId}` — idempotent; position omitted = append */
      add: (nodeId: string, body: AddFavoriteRequest = {}) =>
        http<Favorite>('PUT', `/api/favorites/${nodeId}`, { body }),
      /** `DELETE /api/favorites/{nodeId}` */
      remove: (nodeId: string) => http<void>('DELETE', `/api/favorites/${nodeId}`),
    },
    /** §7.3 */
    recents: {
      /** `GET /api/recents?limit=20` — newest first */
      list: (limit?: number, signal?: AbortSignal) =>
        http<Recent[]>('GET', '/api/recents', { query: { limit }, signal }),
      /** `POST /api/recents/{nodeId}` — record a visit */
      record: (nodeId: string) => http<void>('POST', `/api/recents/${nodeId}`),
    },
    search: {
      /** §7.4 `GET /api/search/quick?q=&limit=&kinds=` — titles + aliases */
      quick: (query: QuickFindQuery = {}, signal?: AbortSignal) =>
        http<QuickHit[]>('GET', '/api/search/quick', { query: { ...query }, signal }),
      /** §9.5 `POST /api/search` — full-text with filters */
      full: (body: SearchRequest, signal?: AbortSignal) =>
        http<SearchResponse>('POST', '/api/search', { body, signal }),
    },
    /** §8 */
    files: {
      /** `POST /api/files` multipart: file, nodeId, blockId?, propertyId?, purpose? */
      upload: (file: File | Blob, opts: UploadFileOptions, signal?: AbortSignal) => {
        const form = new FormData();
        form.append('file', file, file instanceof File ? file.name : undefined);
        form.append('nodeId', opts.nodeId);
        if (opts.blockId) form.append('blockId', opts.blockId);
        if (opts.propertyId) form.append('propertyId', opts.propertyId);
        if (opts.purpose) form.append('purpose', opts.purpose);
        return http<Attachment>('POST', '/api/files', { body: form, signal });
      },
      /** `POST /api/files/from-url` — server-side fetch (SSRF-guarded) */
      fromUrl: (body: FileFromUrlRequest) => http<Attachment>('POST', '/api/files/from-url', { body }),
      /** `GET /api/files/{id}/meta` */
      meta: (id: string, signal?: AbortSignal) =>
        http<Attachment>('GET', `/api/files/${id}/meta`, { signal }),
      /** `DELETE /api/files/{id}` — row only; blobs are GC'd */
      remove: (id: string) => http<void>('DELETE', `/api/files/${id}`),
      /** `GET /api/files/{id}` — URL for `<img>`/`<a>`; `download` adds `?download=1`. */
      url: (id: string, opts: { download?: boolean } = {}) =>
        `${config.baseUrl}/api/files/${id}${opts.download ? '?download=1' : ''}`,
      /** `GET /api/files/{id}/thumb?w=` — image/webp derivative (w ∈ 160|320|640|1280|1920). */
      thumbUrl: (id: string, w?: ThumbWidth) =>
        `${config.baseUrl}/api/files/${id}/thumb${w ? `?w=${w}` : ''}`,
    },
    /** §8 */
    covers: {
      /** `GET /api/covers` — built-in gallery */
      list: (signal?: AbortSignal) => http<CoverItem[]>('GET', '/api/covers', { signal }),
    },
    links: {
      /** §8 `POST /api/links/preview` — never fails: falls back to `{url, finalUrl}` */
      preview: (url: string, signal?: AbortSignal) =>
        http<LinkPreview>('POST', '/api/links/preview', { body: { url }, signal }),
      /** §9.1 `GET /api/links/broken?limit=` */
      broken: (limit?: number, signal?: AbortSignal) =>
        http<BrokenLink[]>('GET', '/api/links/broken', { query: { limit }, signal }),
    },
    /** §9.2 */
    tags: {
      /** `GET /api/tags` — workspace-wide, sorted by name, with counts */
      list: (signal?: AbortSignal) => http<Tag[]>('GET', '/api/tags', { signal }),
      /** `POST /api/tags` — 409 on duplicate (ci) */
      create: (body: CreateTagRequest) => http<Tag>('POST', '/api/tags', { body }),
      /** `PATCH /api/tags/{id}` */
      update: (id: string, body: UpdateTagRequest) => http<Tag>('PATCH', `/api/tags/${id}`, { body }),
      /** `DELETE /api/tags/{id}` */
      remove: (id: string) => http<void>('DELETE', `/api/tags/${id}`),
      /** `GET /api/tags/{id}/nodes?limit=&cursor=` */
      nodes: (id: string, query: CursorQuery = {}, signal?: AbortSignal) =>
        http<CursorPage<Node>>('GET', `/api/tags/${id}/nodes`, { query: { ...query }, signal }),
    },
    /** §9.6 */
    graph: {
      /** `GET /api/graph?rootId=&depth=2&includeTags=true` */
      get: (query: GraphQuery = {}, signal?: AbortSignal) =>
        http<GraphResponse>('GET', '/api/graph', { query: { ...query }, signal }),
    },
    /** §9.7 */
    blocks: {
      /** `GET /api/blocks/{blockId}` — block anchor */
      get: (blockId: string, signal?: AbortSignal) =>
        http<BlockAnchor>('GET', `/api/blocks/${blockId}`, { signal }),
    },
    /** §9.8 `POST /api/export` → application/zip as a Blob. */
    exportZip: async (body: ExportRequest, signal?: AbortSignal): Promise<Blob> => {
      const res = await http('POST', '/api/export', { body, raw: true, signal });
      return res.blob();
    },
    /** §9.8 `POST /api/import` multipart: file, parentId? → ImportResult | 202 {jobId}. */
    importFile: (file: File | Blob, opts: ImportOptions = {}, signal?: AbortSignal) => {
      const form = new FormData();
      form.append('file', file, file instanceof File ? file.name : undefined);
      if (opts.parentId) form.append('parentId', opts.parentId);
      return http<ImportResponse>('POST', '/api/import', { body: form, signal });
    },
    /** §9.8 `GET /api/import/{jobId}` — poll a background import. */
    importStatus: (jobId: string, signal?: AbortSignal) =>
      http<ImportJobStatus>('GET', `/api/import/${jobId}`, { signal }),
    collab: {
      token: (nodeId: string, signal?: AbortSignal) =>
        http<CollabToken>('GET', '/api/collab/token', { query: { nodeId }, signal }),
    },
    /** contracts §1: unauthenticated liveness probe. */
    health: (signal?: AbortSignal) =>
      http<{ status: string }>('GET', '/api/health', { noWorkspace: false, signal }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
