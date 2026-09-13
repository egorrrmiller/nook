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

import type { NodeSummary, Breadcrumb, TrashItem, QuickHit, Favorite, Recent } from '@nook/api-client';

export function nodeSummary(n: Node): NodeSummary {
  return { id: n.id, title: n.title, icon: n.icon ?? null, kind: n.kind, parentId: n.parentId ?? null };
}

/** root → … → parent (self excluded), following parent links through live or deleted nodes. */
export function breadcrumbOf(state: MockState, nodeId: string): Breadcrumb {
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  const chain: NodeSummary[] = [];
  const seen = new Set<string>();
  let id = byId.get(nodeId)?.parentId ?? null;
  while (id && !seen.has(id)) {
    seen.add(id);
    const n = byId.get(id);
    if (!n) break;
    chain.unshift(nodeSummary(n));
    id = n.parentId ?? null;
  }
  return chain;
}

export function refreshHasChildren(state: MockState, nodeId: string | null | undefined): void {
  if (!nodeId) return;
  const node = state.nodes.find((n) => n.id === nodeId);
  if (node) node.hasChildren = state.nodes.some((c) => c.parentId === nodeId && !c.deletedAt);
}

function subtree(state: MockState, rootId: string, includeDeleted: boolean): Node[] {
  const out: Node[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const c of state.nodes) {
      if (c.parentId === id && (includeDeleted || !c.deletedAt)) {
        out.push(c);
        stack.push(c.id);
      }
    }
  }
  return out;
}

export function listTrash(state: MockState, workspaceId: string, q: string | undefined, limit: number): TrashItem[] {
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  const needle = q?.trim().toLowerCase();
  return state.nodes
    .filter((n) => n.workspaceId === workspaceId && n.deletedAt)
    .filter((n) => !n.parentId || !byId.get(n.parentId)?.deletedAt)
    .filter((n) => !needle || n.title.toLowerCase().includes(needle))
    .sort((a, b) => (a.deletedAt! < b.deletedAt! ? 1 : -1))
    .slice(0, limit)
    .map((n) => {
      const parent = n.parentId ? byId.get(n.parentId) : null;
      return {
        node: n,
        deletedAt: n.deletedAt!,
        originalParent: parent ? nodeSummary(parent) : null,
        breadcrumb: breadcrumbOf(state, n.id),
      };
    });
}

export function restoreNode(state: MockState, id: string, parentId: string | null | undefined): Node | null {
  const node = state.nodes.find((n) => n.id === id && n.deletedAt);
  if (!node) return null;
  const original = node.parentId ? state.nodes.find((n) => n.id === node.parentId) : null;
  const target = parentId !== undefined ? parentId : original && !original.deletedAt ? original.id : null;
  const oldParent = node.parentId ?? null;
  for (const n of [node, ...subtree(state, node.id, true)]) n.deletedAt = null;
  node.parentId = target;
  node.updatedAt = new Date().toISOString();
  refreshHasChildren(state, oldParent);
  refreshHasChildren(state, target);
  return node;
}

export function purgeNode(state: MockState, id: string): boolean {
  const node = state.nodes.find((n) => n.id === id && n.deletedAt);
  if (!node) return false;
  const ids = new Set([node.id, ...subtree(state, node.id, true).map((n) => n.id)]);
  state.nodes = state.nodes.filter((n) => !ids.has(n.id));
  state.favorites = state.favorites.filter((f) => !ids.has(f.nodeId));
  state.recents = state.recents.filter((r) => !ids.has(r.nodeId));
  return true;
}

export function emptyTrash(state: MockState, workspaceId: string): void {
  for (const item of listTrash(state, workspaceId, undefined, Number.MAX_SAFE_INTEGER)) purgeNode(state, item.node.id);
}

export function setArchived(state: MockState, id: string, archived: boolean): Node | null {
  const node = state.nodes.find((n) => n.id === id && !n.deletedAt);
  if (!node) return null;
  node.archivedAt = archived ? new Date().toISOString() : null;
  node.updatedAt = new Date().toISOString();
  return node;
}

export function duplicateNode(
  state: MockState,
  id: string,
  body: { parentId?: string | null; position?: string },
): Node | null {
  const src = state.nodes.find((n) => n.id === id && !n.deletedAt);
  if (!src) return null;
  const stamp = new Date().toISOString();
  const copy = (n: Node, parentId: string | null, isRoot: boolean): Node => {
    const dup: Node = {
      ...n,
      id: uuid(),
      parentId,
      title: isRoot ? `${n.title || 'Untitled'} (copy)` : n.title,
      position: isRoot ? (body.position ?? n.position + 'V') : n.position,
      createdAt: stamp,
      updatedAt: stamp,
    };
    state.nodes.push(dup);
    for (const c of state.nodes.filter((x) => x.parentId === n.id && !x.deletedAt)) copy(c, dup.id, false);
    return dup;
  };
  const target = body.parentId !== undefined ? body.parentId : (src.parentId ?? null);
  const dup = copy(src, target, true);
  refreshHasChildren(state, target);
  return dup;
}

/** Dice coefficient over character bigrams — a stand-in for pg_trgm similarity. */
function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const g = new Map<string, number>();
    const t = ` ${s} `;
    for (let i = 0; i < t.length - 1; i++) {
      const k = t.slice(i, i + 2);
      g.set(k, (g.get(k) ?? 0) + 1);
    }
    return g;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  let total = 0;
  for (const [k, v] of ga) {
    total += v;
    inter += Math.min(v, gb.get(k) ?? 0);
  }
  for (const v of gb.values()) total += v;
  return total ? (2 * inter) / total : 0;
}

export function quickFind(
  state: MockState,
  workspaceId: string,
  q: string | undefined,
  limit: number,
  kinds: string[] | undefined,
): QuickHit[] {
  const live = state.nodes.filter(
    (n) => n.workspaceId === workspaceId && !n.deletedAt && (!kinds?.length || kinds.includes(n.kind)),
  );
  const needle = q?.trim().toLowerCase() ?? '';
  if (!needle) {
    return live
      .filter((n) => !n.archivedAt)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, limit)
      .map((n) => ({ node: n, breadcrumb: breadcrumbOf(state, n.id), score: 1 }));
  }
  const score = (value: string): number => {
    const v = value.toLowerCase();
    if (v === needle) return 3;
    if (v.startsWith(needle)) return 2;
    if (v.includes(needle)) return 1.5;
    const sim = similarity(v, needle);
    return sim >= 0.2 ? sim : 0;
  };
  const hits: QuickHit[] = [];
  for (const n of live) {
    let best = score(n.title);
    let matchedAlias: string | undefined;
    for (const a of state.aliases.filter((x) => x.nodeId === n.id)) {
      const s = score(a.value);
      if (s > best) {
        best = s;
        matchedAlias = a.value;
      }
    }
    if (best > 0) hits.push({ node: n, breadcrumb: breadcrumbOf(state, n.id), matchedAlias, score: best });
  }
  return hits
    .sort((a, b) => Number(!!a.node.archivedAt) - Number(!!b.node.archivedAt) || b.score - a.score)
    .slice(0, limit);
}

export function listFavorites(state: MockState, userId: string, workspaceId: string): Favorite[] {
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  return state.favorites
    .filter((f) => f.userId === userId && f.workspaceId === workspaceId)
    .map((f) => ({ f, node: byId.get(f.nodeId) }))
    .filter((x): x is { f: MockFavorite; node: Node } => !!x.node && !x.node.deletedAt)
    .sort((a, b) => (a.f.position < b.f.position ? -1 : 1))
    .map(({ f, node }) => ({ nodeId: f.nodeId, position: f.position, node }));
}

export function listRecents(state: MockState, userId: string, workspaceId: string, limit: number): Recent[] {
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  return state.recents
    .filter((r) => r.userId === userId && r.workspaceId === workspaceId)
    .sort((a, b) => (a.visitedAt < b.visitedAt ? 1 : -1))
    .map((r) => ({ node: byId.get(r.nodeId), visitedAt: r.visitedAt }))
    .filter((r): r is Recent => !!r.node && !r.node.deletedAt)
    .slice(0, limit);
}

export function getSettings(state: MockState, scope: MockSetting['scope'], scopeId: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of state.settings) if (s.scope === scope && s.scopeId === scopeId) out[s.key] = s.value;
  return out;
}

export function putSetting(state: MockState, scope: MockSetting['scope'], scopeId: string, key: string, value: unknown) {
  const existing = state.settings.find((s) => s.scope === scope && s.scopeId === scopeId && s.key === key);
  if (existing) existing.value = value;
  else state.settings.push({ scope, scopeId, key, value });
}

// --- files helpers (frontend-editor) ---

// --- knowledge helpers (frontend-knowledge) ---
