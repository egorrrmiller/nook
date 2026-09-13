// In-memory implementation of contracts §1–§3 used by MSW in dev (VITE_MOCK=1) and in Vitest.
import type {
  AuthResponse,
  Node,
  NodeKind,
  User,
  WorkspaceSummary,
  CreateNodeRequest,
  UpdateNodeRequest,
  Role,
} from '@nook/api-client';

export interface MockUser extends User {
  password: string;
}

export interface MockState {
  users: MockUser[];
  workspaces: WorkspaceSummary[];
  nodes: Node[];
  invites: { code: string; email?: string; expiresAt: string }[];
  /** Currently signed-in user id (cookie emulation). */
  sessionUserId: string | null;
}

let counter = 0;
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

const now = () => new Date().toISOString();

export const MOCK_OWNER = { email: 'owner@localhost', password: 'change-me' };
export const MOCK_INVITE_CODE = 'welcome';

export function createMockState(): MockState {
  const owner: MockUser = {
    id: 'u-owner-0000-0000-0000-000000000001',
    email: MOCK_OWNER.email,
    password: MOCK_OWNER.password,
    displayName: 'Owner',
    avatarUrl: null,
    isInstanceOwner: true,
    createdAt: now(),
  };
  const personal: WorkspaceSummary = {
    id: 'ws-personal-0000-0000-000000000001',
    name: "Owner's Nook",
    icon: '🏠',
    role: 'owner',
    isPersonal: true,
  };
  const team: WorkspaceSummary = {
    id: 'ws-team-0000-0000-0000-000000000002',
    name: 'Shared notes',
    icon: '📚',
    role: 'editor',
    isPersonal: false,
  };
  const mk = (
    ws: string,
    title: string,
    position: string,
    parentId: string | null = null,
    icon: string | null = null,
    kind: NodeKind = 'page',
  ): Node => ({
    id: uuid(),
    workspaceId: ws,
    parentId,
    kind,
    title,
    icon: icon ? { type: 'emoji', value: icon } : null,
    cover: null,
    position,
    pageSettings: { font: 'default', smallText: false, fullWidth: false, locked: false },
    archivedAt: null,
    deletedAt: null,
    createdAt: now(),
    updatedAt: now(),
    effectiveRole: 'owner',
  });
  const gettingStarted = mk(personal.id, 'Getting started', 'a0', null, '👋');
  const projects = mk(personal.id, 'Projects', 'a1', null, '🗂️');
  const reading = mk(personal.id, 'Reading list', 'a2', null, '📖');
  const nookPlan = mk(personal.id, 'Nook plan', 'a0', projects.id, '🧭');
  const ideas = mk(personal.id, 'Ideas', 'a1', projects.id);
  const teamHome = {
    ...mk(team.id, 'Team home', 'a0', null, '🏡'),
    effectiveRole: 'editor' as Role,
  };
  const readOnly = {
    ...mk(team.id, 'Read-only page', 'a1', null, '🔒'),
    effectiveRole: 'viewer' as Role,
  };
  return {
    users: [owner],
    workspaces: [personal, team],
    nodes: [gettingStarted, projects, reading, nookPlan, ideas, teamHome, readOnly],
    invites: [{ code: MOCK_INVITE_CODE, expiresAt: new Date(Date.now() + 864e5).toISOString() }],
    sessionUserId: null,
  };
}

export function toUser(u: MockUser): User {
  const { password: _password, ...user } = u;
  return user;
}

export function authResponse(state: MockState, u: MockUser): AuthResponse {
  return { user: toUser(u), workspaces: state.workspaces };
}

export function listNodes(
  state: MockState,
  workspaceId: string,
  parentId: string | undefined,
  kind: string | undefined,
): Node[] {
  return state.nodes
    .filter((n) => n.workspaceId === workspaceId && !n.deletedAt)
    .filter((n) => (parentId ? n.parentId === parentId : !n.parentId))
    .filter((n) => (kind ? n.kind === kind : true))
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}

function nextPosition(siblings: Node[]): string {
  // Fractional-index stand-in: lexicographically increasing keys.
  const last = siblings[siblings.length - 1]?.position ?? '';
  if (!last) return 'a0';
  const m = /^([a-z]+)(\d+)$/.exec(last);
  if (!m) return last + '1';
  return `${m[1]}${Number(m[2]) + 1}`;
}

export function createNode(state: MockState, workspaceId: string, body: CreateNodeRequest): Node {
  const parentId = body.parentId ?? null;
  const siblings = listNodes(state, workspaceId, parentId ?? undefined, undefined);
  const node: Node = {
    id: uuid(),
    workspaceId,
    parentId,
    kind: body.kind ?? 'page',
    title: body.title ?? '',
    icon: body.icon ?? null,
    cover: null,
    position: nextPosition(siblings),
    pageSettings: { font: 'default', smallText: false, fullWidth: false, locked: false },
    archivedAt: null,
    deletedAt: null,
    createdAt: now(),
    updatedAt: now(),
    effectiveRole: state.workspaces.find((w) => w.id === workspaceId)?.role ?? 'owner',
  };
  state.nodes.push(node);
  return node;
}

export function updateNode(state: MockState, id: string, body: UpdateNodeRequest): Node | null {
  const node = state.nodes.find((n) => n.id === id && !n.deletedAt);
  if (!node) return null;
  if (body.title !== undefined) node.title = body.title;
  if (body.icon !== undefined) node.icon = body.icon;
  if (body.cover !== undefined) node.cover = body.cover;
  if (body.parentId !== undefined) node.parentId = body.parentId;
  if (body.position !== undefined) node.position = body.position;
  if (body.pageSettings) {
    node.pageSettings = {
      font: 'default',
      smallText: false,
      fullWidth: false,
      locked: false,
      ...node.pageSettings,
      ...body.pageSettings,
    };
  }
  node.updatedAt = now();
  return node;
}

export function deleteNode(state: MockState, id: string): boolean {
  const node = state.nodes.find((n) => n.id === id && !n.deletedAt);
  if (!node) return false;
  const stamp = now();
  const stack = [node];
  while (stack.length) {
    const n = stack.pop()!;
    n.deletedAt = stamp;
    for (const c of state.nodes) if (c.parentId === n.id && !c.deletedAt) stack.push(c);
  }
  return true;
}

/** Unsigned HS256-shaped JWT good enough for the frontend to decode claims. */
export function fakeJwt(claims: Record<string, unknown>): string {
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(claims)}.mock-signature`;
}
