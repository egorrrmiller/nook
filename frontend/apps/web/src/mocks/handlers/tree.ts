// Owner: frontend-shell — contracts §7 (tree, trash, favorites, recents, quick find, account/settings)
// plus, behind the marker at the bottom, the two §8 endpoints the pickers need (`GET /api/covers`,
// minimal `POST /api/files` for icons/covers) while `files.ts` is still empty.
import { HttpResponse, http, type HttpHandler } from 'msw';
import type {
  ApiToken,
  Attachment,
  ChangePasswordRequest,
  CoverItem,
  CreateApiTokenRequest,
  DuplicateNodeRequest,
  UpdateMeRequest,
  UpdateWorkspaceRequest,
} from '@nook/api-client';
import {
  breadcrumbOf,
  duplicateNode,
  emptyTrash,
  getSettings,
  listFavorites,
  listRecents,
  listTrash,
  purgeNode,
  putSetting,
  quickFind,
  refreshHasChildren,
  restoreNode,
  setArchived,
  toUser,
  uuid,
  type MockState,
} from '../db';
import type { MockContext } from './context';

/** Per-state extras that are not part of `MockState` (§11.3 keeps the interface coordinator-owned). */
const extras = new WeakMap<MockState, { apiTokens: ApiToken[] }>();
function extra(state: MockState) {
  let e = extras.get(state);
  if (!e) {
    e = {
      apiTokens: [
        { id: 'tok-0000-0000-0000-000000000001', name: 'Obsidian sync', scopes: ['read', 'write'], createdAt: new Date(Date.now() - 864e5 * 3).toISOString() },
      ],
    };
    extras.set(state, e);
  }
  return e;
}

/** Built-in cover gallery (§8) — CSS gradients / solids as data URIs so no static assets are needed. */
function svgCover(fill: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${fill}</linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
const stops = (a: string, b: string) => `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>`;
export const MOCK_COVERS: CoverItem[] = [
  { id: 'gradient-red', name: 'Red', group: 'Gradients', url: svgCover(stops('#f7b2a1', '#e03e3e')), thumbUrl: svgCover(stops('#f7b2a1', '#e03e3e')) },
  { id: 'gradient-blue', name: 'Blue', group: 'Gradients', url: svgCover(stops('#9cc7f5', '#2383e2')), thumbUrl: svgCover(stops('#9cc7f5', '#2383e2')) },
  { id: 'gradient-green', name: 'Green', group: 'Gradients', url: svgCover(stops('#b5e2c9', '#0f7b6c')), thumbUrl: svgCover(stops('#b5e2c9', '#0f7b6c')) },
  { id: 'gradient-purple', name: 'Purple', group: 'Gradients', url: svgCover(stops('#d4c1f5', '#6940a5')), thumbUrl: svgCover(stops('#d4c1f5', '#6940a5')) },
  { id: 'gradient-sunset', name: 'Sunset', group: 'Gradients', url: svgCover(stops('#ffd166', '#ef476f')), thumbUrl: svgCover(stops('#ffd166', '#ef476f')) },
  { id: 'solid-gray', name: 'Gray', group: 'Solid', url: svgCover(stops('#e3e2e0', '#e3e2e0')), thumbUrl: svgCover(stops('#e3e2e0', '#e3e2e0')) },
  { id: 'solid-yellow', name: 'Yellow', group: 'Solid', url: svgCover(stops('#fdecc8', '#fdecc8')), thumbUrl: svgCover(stops('#fdecc8', '#fdecc8')) },
  { id: 'solid-blue', name: 'Blue', group: 'Solid', url: svgCover(stops('#d3e5ef', '#d3e5ef')), thumbUrl: svgCover(stops('#d3e5ef', '#d3e5ef')) },
  { id: 'nature-forest', name: 'Forest', group: 'Nature', url: svgCover(stops('#1b4332', '#95d5b2')), thumbUrl: svgCover(stops('#1b4332', '#95d5b2')) },
  { id: 'nature-ocean', name: 'Ocean', group: 'Nature', url: svgCover(stops('#023e8a', '#90e0ef')), thumbUrl: svgCover(stops('#023e8a', '#90e0ef')) },
  { id: 'pattern-dots', name: 'Dots', group: 'Patterns', url: svgCover(stops('#f7f7f5', '#cfcfcb')), thumbUrl: svgCover(stops('#f7f7f5', '#cfcfcb')) },
];

export function createTreeHandlers(ctx: MockContext): HttpHandler[] {
  const { problem, requireUser, requireWorkspace } = ctx;
  const guard = (request: Request) => {
    const user = requireUser();
    if (!user) return { error: problem(401, 'Not signed in') } as const;
    const ws = requireWorkspace(request);
    if (!ws) return { error: problem(403, 'Missing or invalid X-Workspace-Id') } as const;
    return { user, ws } as const;
  };

  return [
    // ---- §7.1 nodes
    http.get('/api/nodes/:id/ancestors', ({ request, params }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      const node = ctx.state.nodes.find((n) => n.id === params.id && n.workspaceId === g.ws.id);
      if (!node) return problem(404, 'Node not found');
      return HttpResponse.json(breadcrumbOf(ctx.state, node.id));
    }),
    http.post('/api/nodes/:id/duplicate', async ({ request, params }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      const body = (await request.json().catch(() => ({}))) as DuplicateNodeRequest;
      const dup = duplicateNode(ctx.state, String(params.id), body);
      if (!dup) return problem(404, 'Node not found');
      return HttpResponse.json(dup, { status: 201 });
    }),
    http.post('/api/nodes/:id/archive', ({ request, params }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      const node = setArchived(ctx.state, String(params.id), true);
      return node ? HttpResponse.json(node) : problem(404, 'Node not found');
    }),
    http.post('/api/nodes/:id/unarchive', ({ request, params }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      const node = setArchived(ctx.state, String(params.id), false);
      return node ? HttpResponse.json(node) : problem(404, 'Node not found');
    }),

    // ---- §7.2 trash
    http.get('/api/trash', ({ request }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      const url = new URL(request.url);
      const limit = Number(url.searchParams.get('limit') ?? 50) || 50;
      return HttpResponse.json(listTrash(ctx.state, g.ws.id, url.searchParams.get('q') ?? undefined, limit));
    }),
    http.post('/api/trash/:id/restore', async ({ request, params }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      const body = (await request.json().catch(() => ({}))) as { parentId?: string | null };
      const node = restoreNode(ctx.state, String(params.id), body.parentId);
      return node ? HttpResponse.json(node) : problem(404, 'Not in trash');
    }),
    http.delete('/api/trash/:id', ({ request, params }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      return purgeNode(ctx.state, String(params.id))
        ? new HttpResponse(null, { status: 204 })
        : problem(404, 'Not in trash');
    }),
    http.delete('/api/trash', ({ request }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      emptyTrash(ctx.state, g.ws.id);
      return new HttpResponse(null, { status: 204 });
    }),

    // ---- §7.3 favorites & recents
    http.get('/api/favorites', ({ request }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      return HttpResponse.json(listFavorites(ctx.state, g.user.id, g.ws.id));
    }),
    http.put('/api/favorites/:nodeId', async ({ request, params }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      const nodeId = String(params.nodeId);
      const node = ctx.state.nodes.find((n) => n.id === nodeId && n.workspaceId === g.ws.id && !n.deletedAt);
      if (!node) return problem(404, 'Node not found');
      const body = (await request.json().catch(() => ({}))) as { position?: string };
      const mine = ctx.state.favorites.filter((f) => f.userId === g.user.id && f.workspaceId === g.ws.id);
      let fav = mine.find((f) => f.nodeId === nodeId);
      if (!fav) {
        const last = mine.map((f) => f.position).sort().pop();
        fav = {
          userId: g.user.id,
          workspaceId: g.ws.id,
          nodeId,
          position: body.position ?? (last ? last + 'V' : 'a0'),
          createdAt: new Date().toISOString(),
        };
        ctx.state.favorites.push(fav);
      } else if (body.position) fav.position = body.position;
      return HttpResponse.json({ nodeId, position: fav.position, node });
    }),
    http.delete('/api/favorites/:nodeId', ({ request, params }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      ctx.state.favorites = ctx.state.favorites.filter(
        (f) => !(f.userId === g.user.id && f.workspaceId === g.ws.id && f.nodeId === params.nodeId),
      );
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/recents', ({ request }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      const limit = Number(new URL(request.url).searchParams.get('limit') ?? 20) || 20;
      return HttpResponse.json(listRecents(ctx.state, g.user.id, g.ws.id, limit));
    }),
    http.post('/api/recents/:nodeId', ({ request, params }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      const nodeId = String(params.nodeId);
      if (!ctx.state.nodes.some((n) => n.id === nodeId && n.workspaceId === g.ws.id && !n.deletedAt))
        return problem(404, 'Node not found');
      ctx.state.recents = ctx.state.recents.filter(
        (r) => !(r.userId === g.user.id && r.workspaceId === g.ws.id && r.nodeId === nodeId),
      );
      ctx.state.recents.push({ userId: g.user.id, workspaceId: g.ws.id, nodeId, visitedAt: new Date().toISOString() });
      const mine = ctx.state.recents.filter((r) => r.userId === g.user.id && r.workspaceId === g.ws.id);
      if (mine.length > 100) {
        const drop = new Set(mine.sort((a, b) => (a.visitedAt < b.visitedAt ? -1 : 1)).slice(0, mine.length - 100));
        ctx.state.recents = ctx.state.recents.filter((r) => !drop.has(r));
      }
      return new HttpResponse(null, { status: 204 });
    }),

    // ---- §7.4 quick find
    http.get('/api/search/quick', ({ request }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      const url = new URL(request.url);
      const limit = Number(url.searchParams.get('limit') ?? 20) || 20;
      const kinds = url.searchParams.get('kinds')?.split(',').filter(Boolean);
      return HttpResponse.json(quickFind(ctx.state, g.ws.id, url.searchParams.get('q') ?? undefined, limit, kinds));
    }),

    // ---- §7.5 account, settings, workspaces, invites, api tokens
    http.patch('/api/me', async ({ request }) => {
      const user = requireUser();
      if (!user) return problem(401, 'Not signed in');
      const body = (await request.json()) as UpdateMeRequest;
      if (body.displayName !== undefined) {
        if (!body.displayName.trim()) return problem(400, 'Display name is required');
        user.displayName = body.displayName.trim();
      }
      if (body.avatarUrl !== undefined) user.avatarUrl = body.avatarUrl;
      return HttpResponse.json(toUser(user));
    }),
    http.post('/api/me/password', async ({ request }) => {
      const user = requireUser();
      if (!user) return problem(401, 'Not signed in');
      const body = (await request.json()) as ChangePasswordRequest;
      if (body.currentPassword !== user.password) return problem(400, 'Current password is incorrect');
      if (!body.newPassword || body.newPassword.length < 8) return problem(400, 'Password must be at least 8 characters');
      user.password = body.newPassword;
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/me/settings', () => {
      const user = requireUser();
      if (!user) return problem(401, 'Not signed in');
      return HttpResponse.json(getSettings(ctx.state, 'user', user.id));
    }),
    http.put('/api/me/settings/:key', async ({ request, params }) => {
      const user = requireUser();
      if (!user) return problem(401, 'Not signed in');
      const body = (await request.json()) as { value: unknown };
      putSetting(ctx.state, 'user', user.id, String(params.key), body.value);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/workspaces/:id/settings', ({ params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      if (!ctx.state.workspaces.some((w) => w.id === params.id)) return problem(404, 'Workspace not found');
      return HttpResponse.json(getSettings(ctx.state, 'workspace', String(params.id)));
    }),
    http.put('/api/workspaces/:id/settings/:key', async ({ request, params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = ctx.state.workspaces.find((w) => w.id === params.id);
      if (!ws) return problem(404, 'Workspace not found');
      if (ws.role !== 'owner') return problem(403, 'Owner only');
      const body = (await request.json()) as { value: unknown };
      putSetting(ctx.state, 'workspace', ws.id, String(params.key), body.value);
      return new HttpResponse(null, { status: 204 });
    }),
    http.patch('/api/workspaces/:id', async ({ request, params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = ctx.state.workspaces.find((w) => w.id === params.id);
      if (!ws) return problem(404, 'Workspace not found');
      if (ws.role !== 'owner') return problem(403, 'Owner only');
      const body = (await request.json()) as UpdateWorkspaceRequest;
      if (body.name !== undefined) {
        if (!body.name.trim()) return problem(400, 'Name is required');
        ws.name = body.name.trim();
      }
      if (body.icon !== undefined) ws.icon = body.icon;
      return HttpResponse.json(ws);
    }),
    http.delete('/api/workspaces/:id', ({ params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = ctx.state.workspaces.find((w) => w.id === params.id);
      if (!ws) return problem(404, 'Workspace not found');
      if (ws.role !== 'owner') return problem(403, 'Owner only');
      if (ws.isPersonal) return problem(409, 'The personal workspace cannot be deleted');
      ctx.state.workspaces = ctx.state.workspaces.filter((w) => w.id !== ws.id);
      ctx.state.nodes = ctx.state.nodes.filter((n) => n.workspaceId !== ws.id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('/api/workspaces/:id/members', async ({ request, params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = ctx.state.workspaces.find((w) => w.id === params.id);
      if (!ws) return problem(404, 'Workspace not found');
      if (ws.role !== 'owner') return problem(403, 'Owner only');
      const body = (await request.json()) as { email: string; role: 'owner' | 'editor' | 'viewer' };
      if (!body.email?.includes('@')) return problem(400, 'A valid email is required');
      let user = ctx.state.users.find((u) => u.email.toLowerCase() === body.email.toLowerCase());
      if (!user) {
        user = {
          id: uuid(),
          email: body.email,
          password: uuid(),
          displayName: body.email.split('@')[0] ?? body.email,
          avatarUrl: null,
          isInstanceOwner: false,
          createdAt: new Date().toISOString(),
        };
        ctx.state.users.push(user);
      }
      return HttpResponse.json(
        { userId: user.id, email: user.email, displayName: user.displayName, role: body.role ?? 'editor' },
        { status: 201 },
      );
    }),
    http.delete('/api/workspaces/:id/members/:userId', ({ params }) => {
      const me = requireUser();
      if (!me) return problem(401, 'Not signed in');
      const ws = ctx.state.workspaces.find((w) => w.id === params.id);
      if (!ws) return problem(404, 'Workspace not found');
      if (params.userId === me.id) return problem(409, 'You cannot remove yourself');
      ctx.state.users = ctx.state.users.filter((u) => u.id !== params.userId);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/invites', () => {
      if (!requireUser()) return problem(401, 'Not signed in');
      return HttpResponse.json(
        ctx.state.invites.map((i) => ({
          code: i.code,
          email: i.email ?? null,
          expiresAt: i.expiresAt,
          usedAt: i.usedAt ?? null,
          createdAt: i.createdAt ?? i.expiresAt,
        })),
      );
    }),
    http.delete('/api/invites/:code', ({ params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const before = ctx.state.invites.length;
      ctx.state.invites = ctx.state.invites.filter((i) => i.code !== params.code);
      return before === ctx.state.invites.length ? problem(404, 'Invite not found') : new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/api-tokens', () => {
      if (!requireUser()) return problem(401, 'Not signed in');
      return HttpResponse.json(extra(ctx.state).apiTokens.map(({ token: _t, ...rest }) => rest));
    }),
    http.post('/api/api-tokens', async ({ request }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const body = (await request.json()) as CreateApiTokenRequest;
      if (!body.name?.trim()) return problem(400, 'Name is required');
      const tok: ApiToken = {
        id: uuid(),
        name: body.name.trim(),
        scopes: body.scopes?.length ? body.scopes : ['read'],
        createdAt: new Date().toISOString(),
      };
      extra(ctx.state).apiTokens.push(tok);
      return HttpResponse.json({ ...tok, token: `nook_${uuid().replace(/-/g, '')}` }, { status: 201 });
    }),
    http.delete('/api/api-tokens/:id', ({ params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const e = extra(ctx.state);
      e.apiTokens = e.apiTokens.filter((t) => t.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),

    // ---- §8 (temporary, frontend-shell): covers gallery + minimal upload/serve for icon & cover
    // pickers. frontend-editor owns `files.ts`; once it lands these can be removed (MSW picks the
    // first match, and `tree` is registered before `files`).
    http.get('/api/covers', () => {
      if (!requireUser()) return problem(401, 'Not signed in');
      return HttpResponse.json(MOCK_COVERS);
    }),
    http.post('/api/files', async ({ request }) => {
      const g = guard(request);
      if ('error' in g) return g.error;
      // `request.formData()` never settles under jsdom + undici, which would hang Vitest; the
      // browser (worker or fetch fallback) resolves it normally. Fail fast instead of hanging.
      const form = await Promise.race([
        request.formData(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
      ]);
      if (!form) return problem(415, 'multipart/form-data is not supported in this environment');
      const file = form.get('file');
      const nodeId = String(form.get('nodeId') ?? '');
      if (!(file instanceof Blob)) return problem(400, 'file is required');
      if (!ctx.state.nodes.some((n) => n.id === nodeId)) return problem(404, 'Node not found');
      const id = uuid();
      const purpose = (String(form.get('purpose') ?? 'content') as Attachment['purpose']) || 'content';
      const filename = file instanceof File ? file.name : 'upload';
      const isImage = file.type.startsWith('image/');
      const att: Attachment = {
        id,
        nodeId,
        purpose,
        filename,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        sha256: id.replace(/-/g, '').padEnd(64, '0'),
        url: `/api/files/${id}`,
        thumbUrl: isImage ? `/api/files/${id}/thumb` : null,
        meta: {},
        createdAt: new Date().toISOString(),
      };
      ctx.state.attachments.push({ ...att, workspaceId: g.ws.id, data: file });
      return HttpResponse.json(att, { status: 201 });
    }),
    http.get('/api/files/:id/thumb', ({ params }) => {
      const att = ctx.state.attachments.find((a) => a.id === params.id);
      if (!att?.data) return problem(404, 'File not found');
      return new HttpResponse(att.data, { headers: { 'Content-Type': att.mime } });
    }),
    http.get('/api/files/:id', ({ params }) => {
      const att = ctx.state.attachments.find((a) => a.id === params.id);
      if (!att?.data) return problem(404, 'File not found');
      return new HttpResponse(att.data, { headers: { 'Content-Type': att.mime } });
    }),
  ];
}

/** Used by tests/seeds that create nodes outside the handlers. */
export { refreshHasChildren };
