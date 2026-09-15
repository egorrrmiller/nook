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
import type { CollectionDocument, CollectionRow, CollectionView } from '../features/collections/model';

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
  collections: CollectionDocument[];
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
    icon: { type: 'emoji', value: '🏠' },
    role: 'owner',
    isPersonal: true,
  };
  const team: WorkspaceSummary = {
    id: 'ws-team-0000-0000-0000-000000000002',
    name: 'Shared notes',
    icon: { type: 'emoji', value: '📚' },
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
  const projectsDatabase = mk(personal.id, 'Projects database', 'a3', null, '🗃️', 'database');
  const projectRows: CollectionRow[] = [
    { id: uuid(), title: 'Website refresh', icon: { type: 'emoji', value: '🎨' }, properties: { status: 'In progress', priority: 2, due: { start: '2026-09-20' }, done: false, labels: ['Design', 'Frontend'], formula: { expression: 'priority * 2', result: 4 } } },
    { id: uuid(), title: 'Import Obsidian vault', icon: { type: 'emoji', value: '🗂️' }, properties: { status: 'Backlog', priority: 1, due: { start: '2026-09-27' }, done: false, labels: ['Import'], formula: { expression: 'priority * 2', result: 2 } } },
    { id: uuid(), title: 'Ship first table view', icon: { type: 'emoji', value: '🚀' }, properties: { status: 'Done', priority: 3, due: { start: '2026-09-10' }, done: true, labels: ['Frontend'], formula: { expression: 'priority * 2', result: 6 } } },
  ];
  const rowNodes = projectRows.map((row, index) => ({
    ...mk(personal.id, row.title, `a${index}`, projectsDatabase.id, row.icon?.type === 'emoji' ? row.icon.value : null, 'collection_row'),
    id: row.id,
    properties: row.properties as Node['properties'],
  }));
  projects.hasChildren = true;
  projectsDatabase.hasChildren = true;
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
    nodes: [gettingStarted, projects, reading, nookPlan, ideas, projectsDatabase, ...rowNodes, teamHome, readOnly],
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
    collections: [createProjectsCollection(projectsDatabase.id, projectRows)],
  };
}

function createProjectsCollection(nodeId: string, rows: CollectionRow[]): CollectionDocument {
  const properties = [
    { id: 'status', name: 'Status', type: 'select', config: { options: ['Backlog', 'In progress', 'Done'] } },
    { id: 'priority', name: 'Priority', type: 'number' },
    { id: 'due', name: 'Due', type: 'date' },
    { id: 'done', name: 'Done', type: 'checkbox' },
    { id: 'labels', name: 'Labels', type: 'multi_select', config: { options: ['Design', 'Frontend', 'Import'] } },
    { id: 'formula', name: 'Formula', type: 'formula', config: { expression: 'priority * 2' } },
  ] as CollectionDocument['properties'];
  const base = { visiblePropertyIds: ['status', 'priority', 'due', 'done', 'labels', 'formula'], filters: { kind: 'group' as const, operator: 'and' as const, children: [] }, sorts: [], groupBy: 'status' };
  const views: CollectionView[] = (['table', 'board', 'list', 'gallery', 'calendar'] as const).map((kind, index) => ({ id: `projects-${kind}`, name: kind[0]!.toUpperCase() + kind.slice(1), kind, position: `a${index}`, config: { ...base, groupBy: kind === 'board' ? 'status' : kind === 'calendar' ? null : base.groupBy } }));
  return { id: nodeId, nodeId, name: 'Projects database', properties, rows, views, defaultViewId: views[0]!.id };
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
  refreshHasChildren(state, node.parentId);
  return node;
}

export function updateNode(state: MockState, id: string, body: UpdateNodeRequest): Node | null {
  const node = state.nodes.find((n) => n.id === id && !n.deletedAt);
  if (!node) return null;
  if (body.title !== undefined) node.title = body.title;
  if (body.icon !== undefined) node.icon = body.icon;
  if (body.cover !== undefined) node.cover = body.cover;
  const previousParent = node.parentId;
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
  if (previousParent !== node.parentId) {
    refreshHasChildren(state, previousParent);
    refreshHasChildren(state, node.parentId);
  }
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
  refreshHasChildren(state, node.parentId);
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

/**
 * Current document of a page, i.e. what the collab service would have stored through
 * `PUT /internal/documents/{id}` (contracts §3). Mock mode has no collab service, so the editor
 * mirrors its document here through the mock-only `PUT /api/nodes/{id}/blocks` handler.
 */
const mockDocs = new Map<string, { title: string; blocks: Block[]; version: number }>();

export function setDocBlocks(nodeId: string, title: string, blocks: Block[]): number {
  const version = (mockDocs.get(nodeId)?.version ?? 0) + 1;
  mockDocs.set(nodeId, { title, blocks, version });
  return version;
}

/** Falls back to the newest snapshot so seeded pages render before the first edit. */
export function getDocBlocks(state: MockState, nodeId: string): { title: string; blocks: Block[]; version: number } {
  const live = mockDocs.get(nodeId);
  if (live) return live;
  const snaps = state.snapshots.filter((s) => s.nodeId === nodeId).sort((a, b) => b.version - a.version);
  const newest = snaps[0];
  const node = state.nodes.find((n) => n.id === nodeId);
  return { title: newest?.title ?? node?.title ?? '', blocks: newest?.blocks ?? [], version: newest?.version ?? 0 };
}

export function resetDocBlocks(): void {
  mockDocs.clear();
}

/** Walks a block tree (used by `GET /api/blocks/{id}` and block counting). */
export function findBlock(blocks: Block[], blockId: string): Block | null {
  for (const b of blocks) {
    if (b.id === blockId) return b;
    const hit = findBlock(b.children ?? [], blockId);
    if (hit) return hit;
  }
  return null;
}

export function countBlocksDeep(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + 1 + countBlocksDeep(b.children ?? []), 0);
}

/** §8 attachment row backed by an in-memory blob. */
export function createAttachment(
  state: MockState,
  workspaceId: string,
  nodeId: string,
  file: { name: string; type: string; size: number; blob?: Blob },
  extra: { blockId?: string; propertyId?: string; purpose?: Attachment['purpose'] } = {},
): MockAttachment {
  const id = uuid();
  const isImage = file.type.startsWith('image/');
  const attachment: MockAttachment = {
    id,
    workspaceId,
    nodeId,
    blockId: extra.blockId ?? null,
    propertyId: extra.propertyId ?? null,
    purpose: extra.purpose ?? 'content',
    filename: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    sha256: id.replace(/-/g, '').padEnd(64, '0'),
    url: `/api/files/${id}`,
    thumbUrl: isImage ? `/api/files/${id}/thumb` : null,
    meta: {
      ...(isImage ? { width: 1280, height: 860 } : {}),
      ...(file.type === 'application/pdf' ? { pages: 12, textExtracted: true } : {}),
    },
    createdAt: now(),
    ...(file.blob ? { data: file.blob } : {}),
  };
  state.attachments.push(attachment);
  return attachment;
}

/** A few canned previews so bookmark / embed blocks render in mock mode. */
export function linkPreviewFor(url: string): LinkPreview {
  const canned: Record<string, Partial<LinkPreview>> = {
    'blocknotejs.org': {
      title: 'BlockNote — the open source Block-Based rich text editor',
      description: 'A "Notion-style" block-based extensible text editor built on top of ProseMirror and TipTap.',
      siteName: 'BlockNote',
      imageUrl: 'https://www.blocknotejs.org/og.png',
      faviconUrl: 'https://www.blocknotejs.org/favicon.ico',
    },
    'youtube.com': {
      title: 'Rick Astley — Never Gonna Give You Up',
      description: 'The official video for "Never Gonna Give You Up" by Rick Astley.',
      siteName: 'YouTube',
      embed: { provider: 'YouTube', url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', aspectRatio: 16 / 9 },
    },
    'youtu.be': {
      title: 'Rick Astley — Never Gonna Give You Up',
      siteName: 'YouTube',
      embed: { provider: 'YouTube', url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', aspectRatio: 16 / 9 },
    },
  };
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* keep the raw string */
  }
  const hit = canned[host];
  return {
    url,
    finalUrl: url,
    title: hit?.title ?? host,
    description: hit?.description ?? `Preview of ${host}`,
    ...(hit?.imageUrl ? { imageUrl: hit.imageUrl } : {}),
    ...(hit?.faviconUrl ? { faviconUrl: hit.faviconUrl } : {}),
    siteName: hit?.siteName ?? host,
    embed: hit?.embed ?? null,
    fetchedAt: now(),
  };
}


// --- knowledge helpers (frontend-knowledge) ---
// (type-only imports for this section; kept below the marker on purpose)
import type { ImportResult, NodeTag, SearchMatchedIn } from '@nook/api-client';

// Seeds + pure helpers for contracts §9 used by ./handlers/knowledge.ts. Seeding is lazy (per
// state instance) because `createMockState` above is coordinator-owned.

const seededStates = new WeakSet<MockState>();

/** Adds links / aliases / properties / extra snapshots once per state so §9 UIs have data. */
export function seedKnowledge(state: MockState): void {
  if (seededStates.has(state)) return;
  seededStates.add(state);
  const byTitle = (t: string) => state.nodes.find((n) => n.title === t);
  const gettingStarted = byTitle('Getting started');
  const projects = byTitle('Projects');
  const reading = byTitle('Reading list');
  const nookPlan = byTitle('Nook plan');
  const ideas = byTitle('Ideas');
  const teamHome = byTitle('Team home');
  if (!gettingStarted || !projects || !reading || !nookPlan || !ideas || !teamHome) return;
  const ws = gettingStarted.workspaceId;
  const userId = state.users[0]?.id ?? 'u';

  nookPlan.properties = {
    Status: { type: 'select', value: 'In progress' },
    Priority: { type: 'number', value: 2 },
    Due: { type: 'date', value: { start: '2026-09-20', end: '2026-09-27' } },
    Areas: { type: 'multi_select', value: ['product', 'infra'] },
    Done: { type: 'checkbox', value: false },
    Website: { type: 'url', value: 'https://www.notion.com/help/search' },
  };
  reading.properties = { Status: { type: 'select', value: 'Backlog' }, Rating: { type: 'number', value: 4.5 } };

  state.aliases.push(
    { workspaceId: ws, nodeId: nookPlan.id, value: 'Plan' },
    { workspaceId: ws, nodeId: nookPlan.id, value: 'Roadmap' },
    { workspaceId: ws, nodeId: gettingStarted.id, value: 'Onboarding' },
  );

  const mk = (id: string, title: string, text: string[], nodeId: string, version = 1): MockSnapshot => ({
    id,
    nodeId,
    version,
    takenAt: minutesAgo(30),
    user: { id: userId, displayName: 'Owner' },
    title,
    blockCount: text.length,
    kind: 'auto',
    blocks: text.map((t) => paragraph(t, `blk-${id}-${text.indexOf(t)}`)),
  });
  state.snapshots.push(
    mk('snap-plan', 'Nook plan', [
      'Nook is a personal self-hosted Notion: pages, blocks, backlinks and a graph of links.',
      'Phase 3 covers knowledge: backlinks panel, tags, page properties, aliases and full-text search. #nook #roadmap',
      'See [[Getting started]] for the basics of the editor.',
    ], nookPlan.id),
    mk('snap-ideas', 'Ideas', [
      'Ideas for the search dialog: quoted phrases, -exclusions and title: prefixes. #ideas',
      'Embed the Nook plan page here so the roadmap stays visible.',
    ], ideas.id),
    mk('snap-reading', 'Reading list', [
      'Books about knowledge management and note-taking systems.',
      'Zettelkasten, Building a Second Brain, How to Take Smart Notes — see [[Missing page]].',
    ], reading.id),
    mk('snap-projects', 'Projects', ['Every project has its own page; Nook plan is the biggest one.'], projects.id),
    mk('snap-team', 'Team home', ['Shared notes for the team. Links to the old wiki are broken.'], teamHome.id),
  );

  state.links.push(
    {
      sourceNodeId: nookPlan.id,
      blockId: 'blk-snap-plan-2',
      kind: 'mention',
      targetNodeId: gettingStarted.id,
      snippet: 'See Getting started for the basics of the editor.',
    },
    {
      sourceNodeId: ideas.id,
      blockId: 'blk-snap-ideas-1',
      kind: 'embed',
      targetNodeId: nookPlan.id,
      snippet: 'Embed the Nook plan page here so the roadmap stays visible.',
    },
    {
      sourceNodeId: projects.id,
      blockId: 'blk-snap-projects-0',
      kind: 'mention',
      targetNodeId: nookPlan.id,
      snippet: 'Every project has its own page; Nook plan is the biggest one.',
    },
    {
      sourceNodeId: reading.id,
      blockId: 'blk-snap-reading-1',
      kind: 'wikilink',
      targetNodeId: null,
      href: '[[Missing page]]',
      snippet: 'Zettelkasten, Building a Second Brain, How to Take Smart Notes — see [[Missing page]].',
    },
    {
      sourceNodeId: nookPlan.id,
      blockId: 'blk-snap-plan-0',
      kind: 'url',
      targetNodeId: null,
      href: 'https://www.notion.com',
      snippet: 'Nook is a personal self-hosted Notion: pages, blocks, backlinks and a graph of links.',
    },
    {
      sourceNodeId: teamHome.id,
      blockId: 'blk-snap-team-0',
      kind: 'mention',
      targetNodeId: '00000000-dead-4000-8000-000000000000',
      href: `/w/${teamHome.workspaceId}/p/00000000-dead-4000-8000-000000000000`,
      snippet: 'Shared notes for the team. Links to the old wiki are broken.',
    },
  );
  state.nodeTags.push({ nodeId: nookPlan.id, tagId: 'tag-0000-0000-0000-000000000001', source: 'inline' });
  const roadmap: MockTag = { id: 'tag-0000-0000-0000-000000000003', workspaceId: ws, name: 'roadmap', color: '#448361', count: 1 };
  state.tags.push(roadmap);
  state.nodeTags.push({ nodeId: nookPlan.id, tagId: roadmap.id, source: 'inline' });
}

export function liveNode(state: MockState, id: string | null | undefined): Node | undefined {
  if (!id) return undefined;
  return state.nodes.find((n) => n.id === id && !n.deletedAt);
}

/** A link is broken when its target is missing/trashed or it is an unresolved `[[wikilink]]`. */
export function isBrokenLink(state: MockState, l: MockLink): boolean {
  if (l.kind === 'url') return false;
  if (l.kind === 'wikilink' && !l.targetNodeId) {
    const title = (l.href ?? '').replace(/^\[\[|\]\]$/g, '').toLowerCase();
    const resolved =
      state.nodes.some((n) => !n.deletedAt && n.title.toLowerCase() === title) ||
      state.aliases.some((a) => a.value.toLowerCase() === title);
    return !resolved;
  }
  return !liveNode(state, l.targetNodeId);
}

/** Latest snapshot's plain text per block (the mock has no separate `blocks` projection). */
export function nodePlainBlocks(state: MockState, nodeId: string): { blockId: string; text: string }[] {
  const snaps = state.snapshots.filter((s) => s.nodeId === nodeId).sort((a, b) => b.version - a.version);
  const latest = snaps[0];
  if (!latest) return [];
  return latest.blocks.map((b) => ({ blockId: b.id, text: blockText(b) }));
}

function blockText(b: Block): string {
  const parts: string[] = [];
  const walk = (c: unknown) => {
    if (!c) return;
    if (Array.isArray(c)) c.forEach(walk);
    else if (typeof c === 'object') {
      const o = c as Record<string, unknown>;
      if (typeof o.text === 'string') parts.push(o.text);
      if (o.content) walk(o.content);
      if (o.rows) walk(o.rows);
      if (o.cells) walk(o.cells);
    }
  };
  walk(b.content);
  b.children?.forEach((ch) => parts.push(blockText(ch)));
  return parts.join(' ').trim();
}

export function nodeTagsOf(state: MockState, nodeId: string): NodeTag[] {
  const out: NodeTag[] = [];
  for (const nt of state.nodeTags) {
    if (nt.nodeId !== nodeId) continue;
    const t = state.tags.find((x) => x.id === nt.tagId);
    if (!t) continue;
    const existing = out.find((x) => x.id === t.id);
    if (existing) {
      if (nt.source === 'manual') existing.source = 'manual';
      continue;
    }
    out.push({ id: t.id, name: t.name, color: t.color ?? null, source: nt.source });
  }
  return out;
}

export function recountTags(state: MockState): void {
  for (const t of state.tags) t.count = new Set(state.nodeTags.filter((nt) => nt.tagId === t.id).map((nt) => nt.nodeId)).size;
}

/** Like `breadcrumbOf`, but stops at trashed ancestors — knowledge views never link into the trash. */
export function liveBreadcrumbOf(state: MockState, node: Node): Breadcrumb {
  const chain: NodeSummary[] = [];
  let cur = liveNode(state, node.parentId);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    chain.unshift(nodeSummary(cur));
    cur = liveNode(state, cur.parentId);
  }
  return chain;
}

export function isDescendantOf(state: MockState, node: Node, ancestorId: string): boolean {
  let cur = liveNode(state, node.parentId);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    if (cur.id === ancestorId) return true;
    guard.add(cur.id);
    cur = liveNode(state, cur.parentId);
  }
  return false;
}

// --- search grammar (§9.5): terms AND-ed with prefix match, "phrase", -term, title:foo
export interface ParsedQuery {
  terms: string[];
  phrases: string[];
  exclude: string[];
  titleTerms: string[];
}

export function parseSearchQuery(q: string): ParsedQuery {
  const out: ParsedQuery = { terms: [], phrases: [], exclude: [], titleTerms: [] };
  const re = /"([^"]+)"|(\S+)/g;
  for (let m = re.exec(q); m; m = re.exec(q)) {
    if (m[1] !== undefined) out.phrases.push(m[1].toLowerCase());
    else {
      const tok = m[2]!;
      if (tok.startsWith('-') && tok.length > 1) out.exclude.push(tok.slice(1).toLowerCase());
      else if (tok.toLowerCase().startsWith('title:') && tok.length > 6) out.titleTerms.push(tok.slice(6).toLowerCase());
      else out.terms.push(tok.toLowerCase());
    }
  }
  return out;
}

function hasPrefixTerm(text: string, term: string): boolean {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}_#-]+/u);
  return words.some((w) => w.startsWith(term));
}

/** Whether `text` satisfies the parsed query (title-only queries pass `title` as text). */
export function textMatches(text: string, q: ParsedQuery): boolean {
  const lower = text.toLowerCase();
  if (q.exclude.some((e) => hasPrefixTerm(lower, e))) return false;
  if (!q.terms.every((t) => hasPrefixTerm(lower, t))) return false;
  if (!q.phrases.every((p) => lower.includes(p))) return false;
  return true;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** ts_headline stand-in: wraps matching words in `<mark>` and trims around the first hit. */
export function makeSnippet(text: string, q: ParsedQuery, max = 300): string {
  const needles = [...q.terms, ...q.titleTerms, ...q.phrases].filter(Boolean);
  if (!needles.length) return escapeHtml(text.slice(0, max));
  const re = new RegExp(
    needles
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .map((n) => (q.phrases.includes(n) ? n : `(?<![\\p{L}\\p{N}])${n}[\\p{L}\\p{N}_-]*`))
      .join('|'),
    'giu',
  );
  const first = re.exec(text);
  let start = 0;
  if (first && first.index > max / 3) start = Math.max(0, first.index - Math.floor(max / 3));
  let window = text.slice(start, start + max);
  if (start > 0) window = `…${window}`;
  if (start + max < text.length) window = `${window}…`;
  re.lastIndex = 0;
  return escapeHtml(window).replace(re, (m) => `<mark>${m}</mark>`);
}

/** Score: title matches outrank content; earlier hits and shorter titles rank higher. */
export function scoreHit(node: Node, matchedIn: SearchMatchedIn, q: ParsedQuery): number {
  const t = node.title.toLowerCase();
  let score = matchedIn === 'title' ? 10 : matchedIn === 'alias' ? 8 : matchedIn === 'content' ? 4 : 2;
  for (const term of [...q.terms, ...q.titleTerms]) {
    if (t === term) score += 6;
    else if (t.startsWith(term)) score += 3;
  }
  return score;
}

// --- tiny "stored" zip writer so `POST /api/export` can return a real archive
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function buildZip(files: { name: string; content: string }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.content);
    const crc = crc32(data);
    const local = new Uint8Array([
      ...le32(0x04034b50), ...le16(20), ...le16(0x0800), ...le16(0), ...le16(0), ...le16(0),
      ...le32(crc), ...le32(data.length), ...le32(data.length), ...le16(name.length), ...le16(0),
    ]);
    chunks.push(local, name, data);
    central.push(
      new Uint8Array([
        ...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(0x0800), ...le16(0), ...le16(0), ...le16(0),
        ...le32(crc), ...le32(data.length), ...le32(data.length), ...le16(name.length), ...le16(0), ...le16(0),
        ...le16(0), ...le16(0), ...le32(0), ...le32(offset),
      ]),
      name,
    );
    offset += local.length + name.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array([
    ...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(files.length), ...le16(files.length),
    ...le32(cdSize), ...le32(offset), ...le16(0),
  ]);
  const parts = [...chunks, ...central, end];
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((s, c) => s + c.length, 0)));
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.length;
  }
  return new Blob([out], { type: 'application/zip' });
}

/** §9.8 import jobs (202 path) — advance one step per poll. */
export interface MockImportJob {
  id: string;
  polls: number;
  result: ImportResult;
}
export const importJobs = new Map<string, MockImportJob>();
