// Hand-written API types. Replaced by src/generated when
// `pnpm gen:api` finds an OpenAPI document.

export type Role = 'owner' | 'editor' | 'viewer';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  isInstanceOwner: boolean;
  createdAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  icon?: NodeIcon | null;
  role: Role;
  isPersonal: boolean;
}

export interface AuthResponse {
  user: User;
  workspaces: WorkspaceSummary[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  inviteCode: string;
  email: string;
  password: string;
  displayName: string;
}

export interface InviteInfo {
  valid: boolean;
  email?: string;
}

export interface CreateInviteRequest {
  email?: string;
  expiresInHours?: number;
}

export interface Invite {
  code: string;
  url: string;
  expiresAt: string;
}

/** §7.5 `GET /api/invites` row. */
export interface InviteListItem {
  code: string;
  email?: string | null;
  expiresAt: string;
  usedAt?: string | null;
  createdAt: string;
}

export type ApiTokenScope = 'read' | 'write' | 'admin';

export interface ApiToken {
  id: string;
  name: string;
  /** Only present in the POST response. */
  token?: string;
  scopes: ApiTokenScope[];
  createdAt: string;
}

export interface CreateApiTokenRequest {
  name: string;
  scopes: ApiTokenScope[];
}

export interface CreateWorkspaceRequest {
  name: string;
  icon?: NodeIcon;
}

/** §7.5 `PATCH /api/workspaces/{id}`. */
export interface UpdateWorkspaceRequest {
  name?: string;
  icon?: NodeIcon | null;
}

export interface WorkspaceMember {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
}

export interface AddMemberRequest {
  email: string;
  role: Role;
}

// ---------------------------------------------------------------------------------------------
// §2 / §7 nodes
// ---------------------------------------------------------------------------------------------

export type NodeKind = 'page' | 'folder' | 'database' | 'collection_row' | 'file';

export interface NodeIcon {
  /** `upload` → value is an attachment id (§8), rendered through `/api/files/{value}/thumb`. */
  type: 'emoji' | 'url' | 'upload';
  value: string;
}

/** §8: `upload` → attachment id, `url` → absolute URL, `gallery` → `CoverItem.id`. */
export interface NodeCover {
  type: 'upload' | 'url' | 'gallery';
  value: string;
  /** Vertical focus 0..1. */
  position?: number;
}

export interface PageSettings {
  font: 'default' | 'serif' | 'mono';
  smallText: boolean;
  fullWidth: boolean;
  locked: boolean;
}

export interface Node {
  id: string;
  workspaceId: string;
  parentId?: string | null;
  kind: NodeKind;
  title: string;
  icon?: NodeIcon | null;
  cover?: NodeCover | null;
  /** Fractional index. */
  position: string;
  pageSettings?: PageSettings | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  effectiveRole: Role;
  /** §7: has at least one live (not deleted) child. */
  hasChildren?: boolean;
  /** §9.3: null/absent when the page has none. */
  properties?: PageProperties | null;
}

/** §7 shared shape: a lightweight node reference. */
export interface NodeSummary {
  id: string;
  title: string;
  icon?: NodeIcon | null;
  kind: NodeKind;
  parentId?: string | null;
}

/** root → … → parent (self excluded). */
export type Breadcrumb = NodeSummary[];

export interface ListNodesQuery {
  parentId?: string;
  kind?: NodeKind;
  /** §7.1: archived nodes are hidden unless true. */
  includeArchived?: boolean;
}

export interface CreateNodeRequest {
  parentId?: string | null;
  kind: NodeKind;
  title?: string;
  icon?: NodeIcon;
}

export interface UpdateNodeRequest {
  title?: string;
  icon?: NodeIcon | null;
  cover?: NodeCover | null;
  parentId?: string | null;
  position?: string;
  /** §7.1: merged, not replaced. */
  pageSettings?: Partial<PageSettings>;
}

/** §7.1 `POST /api/nodes/{id}/duplicate`. */
export interface DuplicateNodeRequest {
  parentId?: string | null;
  position?: string;
}

// ---------------------------------------------------------------------------------------------
// §7.2 trash · §7.3 favorites & recents · §7.4 quick find
// ---------------------------------------------------------------------------------------------

export interface TrashItem {
  node: Node;
  deletedAt: string;
  originalParent?: NodeSummary | null;
  breadcrumb: Breadcrumb;
}

export interface TrashListQuery {
  q?: string;
  limit?: number;
}

export interface RestoreTrashRequest {
  parentId?: string | null;
}

export interface Favorite {
  nodeId: string;
  /** Fractional index. */
  position: string;
  node: Node;
}

export interface AddFavoriteRequest {
  position?: string;
}

export interface Recent {
  node: Node;
  visitedAt: string;
}

export interface QuickFindQuery {
  q?: string;
  limit?: number;
  /** Comma-separated NodeKind list, e.g. `page,database`. */
  kinds?: string;
}

export interface QuickHit {
  node: Node;
  breadcrumb: Breadcrumb;
  matchedAlias?: string;
  score: number;
}

// ---------------------------------------------------------------------------------------------
// §7.5 account & settings
// ---------------------------------------------------------------------------------------------

export interface UpdateMeRequest {
  displayName?: string;
  avatarUrl?: string | null;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** Per-user (cross-device) or per-workspace key/value prefs; values are arbitrary JSON ≤ 16 KB. */
export type UserSettings = Record<string, unknown>;
export type WorkspaceSettings = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------
// §3 collab
// ---------------------------------------------------------------------------------------------

export interface CollabToken {
  token: string;
  /** `/collab` (same origin) — see contracts §3. */
  wsUrl: string;
}

export interface CollabTokenClaims {
  sub: string;
  name: string;
  color: string;
  node: string;
  role: 'editor' | 'viewer';
  exp?: number;
}

// ---------------------------------------------------------------------------------------------
// §4 block JSON (loose — BlockNote's document shape, schemaVersion 1)
// ---------------------------------------------------------------------------------------------

export interface Styles {
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  code?: true;
  textColor?: string;
  backgroundColor?: string;
}

export interface StyledText {
  type: 'text';
  text: string;
  styles: Styles;
}

export interface InlineLink {
  type: 'link';
  href: string;
  content: StyledText[];
}

/** Custom inline content, e.g. `mention` with `props.nodeId`. */
export interface CustomInlineContent {
  type: string;
  props: Record<string, unknown>;
}

export type InlineContent = StyledText | InlineLink | CustomInlineContent;

export interface TableContent {
  type: 'tableContent';
  columnWidths?: (number | undefined)[];
  rows: { cells: (InlineContent[] | { type: 'tableCell'; content: InlineContent[]; props?: Record<string, unknown> })[] }[];
}

export interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content?: InlineContent[] | TableContent | undefined;
  children: Block[];
}

// ---------------------------------------------------------------------------------------------
// §8 files, covers, link previews
// ---------------------------------------------------------------------------------------------

export type AttachmentPurpose = 'content' | 'icon' | 'cover';

export interface AttachmentMeta {
  width?: number;
  height?: number;
  duration?: number;
  pages?: number;
  textExtracted?: boolean;
}

export interface Attachment {
  id: string;
  nodeId: string;
  blockId?: string | null;
  propertyId?: string | null;
  purpose: AttachmentPurpose;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  /** `/api/files/{id}` */
  url: string;
  /** `/api/files/{id}/thumb` — images only. */
  thumbUrl?: string | null;
  meta: AttachmentMeta;
  createdAt: string;
}

export interface UploadFileOptions {
  nodeId: string;
  blockId?: string;
  propertyId?: string;
  purpose?: AttachmentPurpose;
}

export interface FileFromUrlRequest {
  url: string;
  nodeId: string;
  blockId?: string;
  purpose?: AttachmentPurpose;
}

export type ThumbWidth = 160 | 320 | 640 | 1280 | 1920;

export type CoverGroup = 'Gradients' | 'Solid' | 'Nature' | 'Patterns';

export interface CoverItem {
  id: string;
  name: string;
  group: CoverGroup;
  url: string;
  thumbUrl: string;
}

export interface LinkEmbed {
  provider: string;
  html?: string;
  url?: string;
  width?: number;
  height?: number;
  aspectRatio?: number;
}

export interface LinkPreview {
  url: string;
  finalUrl: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  faviconUrl?: string;
  siteName?: string;
  embed?: LinkEmbed | null;
  fetchedAt?: string;
}

export interface LinkPreviewRequest {
  url: string;
}

// ---------------------------------------------------------------------------------------------
// §9.1 links & backlinks
// ---------------------------------------------------------------------------------------------

export type LinkKind = 'mention' | 'wikilink' | 'embed' | 'synced' | 'relation' | 'url';

export interface Backlink {
  sourceNode: NodeSummary;
  blockId?: string;
  kind: LinkKind;
  /** Plain text of the source block, ≤ 200 chars. */
  snippet: string;
}

export interface OutgoingLink {
  targetNode?: NodeSummary | null;
  targetBlockId?: string;
  kind: LinkKind;
  href?: string;
  broken: boolean;
}

export interface BrokenLink {
  sourceNode: NodeSummary;
  blockId: string;
  href?: string;
  targetNodeId?: string;
}

// ---------------------------------------------------------------------------------------------
// §9.2 tags
// ---------------------------------------------------------------------------------------------

export interface Tag {
  id: string;
  name: string;
  color?: string | null;
  /** Number of nodes carrying the tag (workspace-wide listing). */
  count?: number;
}

export type NodeTagSource = 'manual' | 'inline';

/** `GET /api/nodes/{id}/tags` — union of manual and inline (`#hashtag`) tags. */
export interface NodeTag extends Tag {
  source: NodeTagSource;
}

export interface CreateTagRequest {
  name: string;
  color?: string | null;
}

export interface UpdateTagRequest {
  name?: string;
  color?: string | null;
}

/** Replaces the manual set; unknown `names` are created. */
export interface SetNodeTagsRequest {
  tagIds?: string[];
  names?: string[];
}

/** Generic cursor page (`{items, nextCursor?}`) used by tags/nodes and history. */
export interface CursorPage<T> {
  items: T[];
  nextCursor?: string | null;
}

export interface CursorQuery {
  limit?: number;
  cursor?: string;
}

// ---------------------------------------------------------------------------------------------
// §9.3 properties · §9.4 aliases
// ---------------------------------------------------------------------------------------------

export type PagePropertyType =
  | 'text'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'url'
  | 'email'
  | 'phone';

export interface DateRange {
  start: string;
  end?: string;
}

export type PagePropertyValue = string | number | boolean | string[] | DateRange | null;

export interface PageProperty {
  type: PagePropertyType;
  value: PagePropertyValue;
}

/** Keyed by property name. */
export type PageProperties = Record<string, PageProperty>;

/** `PATCH /api/nodes/{id}/properties` — merge; `null` removes. */
export type PatchPagePropertiesRequest = Partial<Record<string, PageProperty | null>>;

export interface SetAliasesRequest {
  aliases: string[];
}

// ---------------------------------------------------------------------------------------------
// §9.5 full-text search
// ---------------------------------------------------------------------------------------------

export interface SearchScope {
  ancestorId?: string;
}

export interface SearchFilters {
  titleOnly?: boolean;
  kinds?: NodeKind[];
  tagIds?: string[];
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  includeArchived?: boolean;
  includeFiles?: boolean;
  /** Optional extension: one hit per matching block instead of per node. */
  perBlock?: boolean;
}

export type SearchSort = 'relevance' | 'updated' | 'created';

export interface SearchRequest {
  query: string;
  scope?: SearchScope;
  filters?: SearchFilters;
  sort?: SearchSort;
  /** default 20, max 100 */
  limit?: number;
  cursor?: string;
}

export type SearchMatchedIn = 'title' | 'content' | 'file' | 'alias';

export interface SearchHit {
  node: Node;
  breadcrumb: Breadcrumb;
  blockId?: string;
  attachment?: Attachment;
  /** ts_headline with `<mark>…</mark>`, ≤ 300 chars. */
  snippet: string;
  score: number;
  matchedIn: SearchMatchedIn;
}

export interface SearchResponse {
  hits: SearchHit[];
  nextCursor?: string | null;
  total: number;
}

// ---------------------------------------------------------------------------------------------
// §9.6 graph
// ---------------------------------------------------------------------------------------------

export interface GraphQuery {
  rootId?: string;
  depth?: number;
  includeTags?: boolean;
}

export interface GraphNode {
  id: string;
  title: string;
  icon?: NodeIcon | null;
  kind: NodeKind;
  degree: number;
  tagIds?: string[];
}

export type GraphEdgeKind = LinkKind | 'tag' | 'parent';

export interface GraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Set when the 2 000-node cap was hit. */
  truncated?: boolean;
}

// ---------------------------------------------------------------------------------------------
// §9.7 history & block reads
// ---------------------------------------------------------------------------------------------

export type VersionKind = 'auto' | 'manual' | 'pre-restore';

export interface VersionUser {
  id: string;
  displayName: string;
}

export interface Version {
  id: string;
  version: number;
  takenAt: string;
  user?: VersionUser | null;
  title: string;
  blockCount: number;
  kind: VersionKind;
}

export type HistoryPage = CursorPage<Version>;

/** `GET /api/nodes/{id}/history/{versionId}` */
export interface HistoryEntry {
  title: string;
  blocks: Block[];
  takenAt: string;
  user?: VersionUser | null;
}

export interface RestoreVersionResponse {
  version: number;
}

/** `GET /api/nodes/{id}/blocks` — current projection as a tree. */
export interface NodeBlocks {
  title: string;
  blocks: Block[];
  version: number;
}

/** `GET /api/blocks/{blockId}` — block anchors. */
export interface BlockAnchor {
  nodeId: string;
  block: Block;
  breadcrumb: Breadcrumb;
}

// ---------------------------------------------------------------------------------------------
// §9.8 export & import
// ---------------------------------------------------------------------------------------------

export type ExportFormat = 'markdown' | 'html';

export interface ExportRequest {
  nodeIds: string[];
  includeChildren: boolean;
  format: ExportFormat;
  includeFiles: boolean;
}

export interface ImportOptions {
  parentId?: string | null;
}

export interface ImportResult {
  pagesCreated: number;
  nodeIds: string[];
  warnings: string[];
}

/** 202 response when the archive is large enough to run as a background job. */
export interface ImportJobAccepted {
  jobId: string;
}

export type ImportJobState = 'queued' | 'running' | 'done' | 'failed';

export interface ImportJobStatus {
  status: ImportJobState;
  result?: ImportResult;
}

export type ImportResponse = ImportResult | ImportJobAccepted;

export function isImportJobAccepted(r: ImportResponse): r is ImportJobAccepted {
  return typeof (r as ImportJobAccepted).jobId === 'string';
}
