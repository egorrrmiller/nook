// Hand-written types for docs/contracts.md §1–§3. Replaced by src/generated when
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
  icon?: string | null;
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
  icon?: string;
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

export type NodeKind = 'page' | 'folder' | 'database' | 'collection_row' | 'file';

export interface NodeIcon {
  type: 'emoji' | 'url' | 'upload';
  value: string;
}

export interface NodeCover {
  type: string;
  value: string;
  [key: string]: unknown;
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
}

export interface ListNodesQuery {
  parentId?: string;
  kind?: NodeKind;
}

export interface CreateNodeRequest {
  parentId?: string;
  kind: 'page';
  title?: string;
  icon?: NodeIcon;
}

export interface UpdateNodeRequest {
  title?: string;
  icon?: NodeIcon | null;
  cover?: NodeCover | null;
  parentId?: string | null;
  position?: string;
  pageSettings?: Partial<PageSettings>;
}

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
