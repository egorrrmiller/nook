// In-memory implementation of contracts §1–§3 (+ the §7–§9 state slices, see §11.3) used by MSW
// in dev (VITE_MOCK=1) and in Vitest. Handlers live in ./handlers/{core,tree,files,knowledge}.ts.
import type {
  Attachment,
  AuthResponse,
  Block,
  CreateNodeRequest,
  LinkKind,
  LinkPreview,
  Node,
  NodeKind,
  NodeTagSource,
  Role,
  Tag,
  UpdateNodeRequest,
  User,
  Version,
  WorkspaceSummary,
} from '@nook/api-client';

export interface MockUser extends User {
  password: string;
}

// ---------------------------------------------------------------------------------------------
// Wave-1 state slices (contracts §11.3). Owners fill them from their own handler file.
// ---------------------------------------------------------------------------------------------

/** §7.3 favorites(user_id, workspace_id, node_id, position, created_at) */
export interface MockFavorite {
  userId: string;
  workspaceId: string;
  nodeId: string;
  position: string;
  createdAt: string;
}

/** §7.3 recents(user_id, workspace_id, node_id, visited_at) */
export interface MockRecent {
  userId: string;
  workspaceId: string;
  nodeId: string;
  visitedAt: string;
}

/** §8 attachment row; `data` keeps the uploaded bytes so `GET /api/files/{id}` can serve them. */
export interface MockAttachment extends Attachment {
  workspaceId: string;
  data?: Blob;
}

/** §9.2 tags (workspace-scoped) */
export interface MockTag extends Tag {
  workspaceId: string;
}

/** §9.2 node_tags(node_id, tag_id, source) */
export interface MockNodeTag {
  nodeId: string;
  tagId: string;
  source: NodeTagSource;
}

/** §9.7 page-history snapshot: the `Version` row plus the captured blocks. */
export interface MockSnapshot extends Version {
  nodeId: string;
  blocks: Block[];
}

/** §9.1 one extracted link (source block → target). */
export interface MockLink {
  sourceNodeId: string;
  blockId?: string;
  kind: LinkKind;
  targetNodeId?: string | null;
  targetBlockId?: string;
  href?: string;
  /** Plain text of the source block, ≤ 200 chars. */
  snippet: string;
}

/** §7.5 settings(scope, scope_id, key, value) */
export interface MockSetting {
  scope: 'user' | 'workspace';
  scopeId: string;
  key: string;
  value: unknown;
}

/** §9.4 aliases(workspace_id, node_id, value) */
export interface MockAlias {
  workspaceId: string;
  nodeId: string;
  value: string;
}

export interface MockState {
  users: MockUser[];
  workspaces: WorkspaceSummary[];
  nodes: Node[];
  invites: { code: string; email?: string; expiresAt: string; usedAt?: string; createdAt?: string }[];
  /** Currently signed-in user id (cookie emulation). */
  sessionUserId: string | null;
  // --- wave 1 (§11.3)
  favorites: MockFavorite[];
  recents: MockRecent[];
  attachments: MockAttachment[];
  tags: MockTag[];
  nodeTags: MockNodeTag[];
  snapshots: MockSnapshot[];
  links: MockLink[];
  settings: MockSetting[];
  aliases: MockAlias[];
  /** Keyed by URL. */
  linkPreviews: Record<string, LinkPreview>;
}

let counter = 0;
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

const now = () => new Date().toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const MOCK_OWNER = { email: 'owner@localhost', password: 'change-me' };
export const MOCK_INVITE_CODE = 'welcome';

/** Minimal §4 paragraph block used by seeded snapshots. */
export function paragraph(text: string, id = uuid()): Block {
  return {
    id,
    type: 'paragraph',
    props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
    content: [{ type: 'text', text, styles: {} }],
    children: [],
  };
}

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
    hasChildren: false,
    properties: null,
  });
  const gettingStarted = mk(personal.id, 'Getting started', 'a0', null, '👋');
  const projects = mk(personal.id, 'Projects', 'a1', null, '🗂️');
  const reading = mk(personal.id, 'Reading list', 'a2', null, '📖');
  const nookPlan = mk(personal.id, 'Nook plan', 'a0', projects.id, '🧭');
  const ideas = mk(personal.id, 'Ideas', 'a1', projects.id);
  projects.hasChildren = true;
  const teamHome = {
    ...mk(team.id, 'Team home', 'a0', null, '🏡'),
    effectiveRole: 'editor' as Role,
  };
  const readOnly = {
    ...mk(team.id, 'Read-only page', 'a1', null, '🔒'),
    effectiveRole: 'viewer' as Role,
  };

  // --- wave-1 seeds so the UIs have something to show
  const tagNook: MockTag = { id: 'tag-0000-0000-0000-000000000001', workspaceId: personal.id, name: 'nook', color: '#2383e2', count: 1 };
  const tagIdeas: MockTag = { id: 'tag-0000-0000-0000-000000000002', workspaceId: personal.id, name: 'ideas', color: '#e2a023', count: 1 };
  const snapshotV1: MockSnapshot = {
    id: 'snap-0000-0000-0000-000000000001',
    nodeId: gettingStarted.id,
    version: 1,
    takenAt: minutesAgo(60),
    user: { id: owner.id, displayName: owner.displayName },
    title: 'Getting started',
    blockCount: 1,
    kind: 'auto',
    blocks: [paragraph('Welcome to Nook.')],
  };
  const snapshotV2: MockSnapshot = {
    id: 'snap-0000-0000-0000-000000000002',
    nodeId: gettingStarted.id,
    version: 2,
    takenAt: minutesAgo(15),
    user: { id: owner.id, displayName: owner.displayName },
    title: 'Getting started',
    blockCount: 2,
    kind: 'manual',
    blocks: [paragraph('Welcome to Nook.'), paragraph('Press ⌘K to search, [[ to link a page.')],
  };

  return {
    users: [owner],
    workspaces: [personal, team],
    nodes: [gettingStarted, projects, reading, nookPlan, ideas, teamHome, readOnly],
    invites: [{ code: MOCK_INVITE_CODE, expiresAt: new Date(Date.now() + 864e5).toISOString(), createdAt: now() }],
    sessionUserId: null,
    favorites: [
      { userId: owner.id, workspaceId: personal.id, nodeId: gettingStarted.id, position: 'a0', createdAt: now() },
    ],
    recents: [{ userId: owner.id, workspaceId: personal.id, nodeId: nookPlan.id, visitedAt: minutesAgo(5) }],
    attachments: [],
    tags: [tagNook, tagIdeas],
    nodeTags: [
      { nodeId: gettingStarted.id, tagId: tagNook.id, source: 'manual' },
      { nodeId: ideas.id, tagId: tagIdeas.id, source: 'inline' },
    ],
    snapshots: [snapshotV1, snapshotV2],
    links: [],
    settings: [],
    aliases: [],
    linkPreviews: {},
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
    hasChildren: false,
    properties: null,
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

// ---------------------------------------------------------------------------------------------
// Per-agent helper sections (contracts §11.3). Append below your marker only; never edit above it.
// ---------------------------------------------------------------------------------------------

// --- tree helpers (frontend-shell) ---

// --- files helpers (frontend-editor) ---

// --- knowledge helpers (frontend-knowledge) ---
