import { createHttp, type ApiConfig } from './http';
import type {
  AddMemberRequest,
  ApiToken,
  AuthResponse,
  CollabToken,
  CreateApiTokenRequest,
  CreateInviteRequest,
  CreateNodeRequest,
  CreateWorkspaceRequest,
  Invite,
  InviteInfo,
  ListNodesQuery,
  LoginRequest,
  Node,
  RegisterRequest,
  UpdateNodeRequest,
  WorkspaceMember,
  WorkspaceSummary,
} from './types';

/** Typed client for contracts §1–§3. */
export function createApiClient(config: ApiConfig) {
  const http = createHttp(config);
  return {
    config,
    auth: {
      login: (body: LoginRequest) =>
        http<AuthResponse>('POST', '/api/auth/login', { body, noWorkspace: true }),
      logout: () => http<void>('POST', '/api/auth/logout', { noWorkspace: true }),
      register: (body: RegisterRequest) =>
        http<AuthResponse>('POST', '/api/auth/register', { body, noWorkspace: true }),
      invite: (code: string) =>
        http<InviteInfo>('GET', `/api/auth/invite/${encodeURIComponent(code)}`, {
          noWorkspace: true,
        }),
    },
    me: (signal?: AbortSignal) => http<AuthResponse>('GET', '/api/me', { noWorkspace: true, signal }),
    invites: {
      create: (body: CreateInviteRequest) => http<Invite>('POST', '/api/invites', { body }),
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
    },
    nodes: {
      list: (query: ListNodesQuery = {}, signal?: AbortSignal) =>
        http<Node[]>('GET', '/api/nodes', { query: { ...query }, signal }),
      get: (id: string, signal?: AbortSignal) => http<Node>('GET', `/api/nodes/${id}`, { signal }),
      create: (body: CreateNodeRequest) => http<Node>('POST', '/api/nodes', { body }),
      update: (id: string, body: UpdateNodeRequest) =>
        http<Node>('PATCH', `/api/nodes/${id}`, { body }),
      remove: (id: string) => http<void>('DELETE', `/api/nodes/${id}`),
    },
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
