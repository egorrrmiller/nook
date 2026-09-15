// Contracts §1–§3 (identity, workspaces & nodes, collab token). Coordinator-owned — agents add
// their handlers in ./tree.ts, ./files.ts, ./knowledge.ts instead of editing this file.
import { HttpResponse, http, type HttpHandler } from 'msw';
import type {
  CreateWorkspaceRequest,
  CreateNodeRequest,
  LoginRequest,
  RegisterRequest,
  UpdateNodeRequest,
} from '@nook/api-client';
import { authResponse, createNode, deleteNode, fakeJwt, listNodes, updateNode, uuid } from '../db';
import type { MockContext } from './context';

export function createCoreHandlers(ctx: MockContext): HttpHandler[] {
  const { problem, requireUser, requireWorkspace } = ctx;

  return [
    http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),

    // ---- §1 identity & auth
    http.post('/api/auth/login', async ({ request }) => {
      const body = (await request.json()) as LoginRequest;
      const user = ctx.state.users.find(
        (u) => u.email.toLowerCase() === body.email?.toLowerCase() && u.password === body.password,
      );
      if (!user) return problem(401, 'Invalid email or password');
      ctx.state.sessionUserId = user.id;
      return HttpResponse.json(authResponse(ctx.state, user));
    }),
    http.post('/api/auth/logout', () => {
      ctx.state.sessionUserId = null;
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/auth/invite/:code', ({ params }) => {
      const inv = ctx.state.invites.find((i) => i.code === params.code);
      const valid = !!inv && new Date(inv.expiresAt).getTime() > Date.now();
      return HttpResponse.json({ valid, email: inv?.email });
    }),
    http.post('/api/auth/register', async ({ request }) => {
      const body = (await request.json()) as RegisterRequest;
      const inv = ctx.state.invites.find((i) => i.code === body.inviteCode);
      if (!inv) return problem(400, 'Invalid invite code');
      if (new Date(inv.expiresAt).getTime() < Date.now()) return problem(410, 'Invite expired');
      if (!body.email || !body.password || body.password.length < 8)
        return problem(400, 'Password must be at least 8 characters');
      if (ctx.state.users.some((u) => u.email.toLowerCase() === body.email.toLowerCase()))
        return problem(400, 'Email already registered');
      const user = {
        id: uuid(),
        email: body.email,
        password: body.password,
        displayName: body.displayName || body.email.split('@')[0] || 'User',
        avatarUrl: null,
        isInstanceOwner: false,
        createdAt: new Date().toISOString(),
      };
      ctx.state.users.push(user);
      ctx.state.workspaces.push({
        id: uuid(),
        name: `${user.displayName}'s Nook`,
        icon: null,
        role: 'owner',
        isPersonal: true,
      });
      ctx.state.invites = ctx.state.invites.filter((i) => i !== inv);
      ctx.state.sessionUserId = user.id;
      return HttpResponse.json(authResponse(ctx.state, user));
    }),
    http.get('/api/me', () => {
      const user = requireUser();
      if (!user) return problem(401, 'Not signed in');
      return HttpResponse.json(authResponse(ctx.state, user));
    }),
    http.post('/api/invites', async ({ request }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const body = (await request.json().catch(() => ({}))) as {
        email?: string;
        expiresInHours?: number;
      };
      const code = uuid().slice(0, 8);
      const expiresAt = new Date(Date.now() + (body.expiresInHours ?? 72) * 36e5).toISOString();
      ctx.state.invites.push({ code, email: body.email, expiresAt, createdAt: new Date().toISOString() });
      return HttpResponse.json(
        { code, url: `${new URL(request.url).origin}/register?invite=${code}`, expiresAt },
        { status: 201 },
      );
    }),

    // ---- §2 workspaces & nodes
    http.get('/api/workspaces', () => {
      if (!requireUser()) return problem(401, 'Not signed in');
      return HttpResponse.json(ctx.state.workspaces);
    }),
    http.post('/api/workspaces', async ({ request }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const body = (await request.json()) as CreateWorkspaceRequest;
      const ws = {
        id: uuid(),
        name: body.name,
        icon: body.icon ?? null,
        role: 'owner' as const,
        isPersonal: false,
      };
      ctx.state.workspaces.push(ws);
      return HttpResponse.json(ws, { status: 201 });
    }),
    http.get('/api/workspaces/:id/members', ({ params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = ctx.state.workspaces.find((w) => w.id === params.id);
      if (!ws) return problem(404, 'Workspace not found');
      return HttpResponse.json(
        ctx.state.users.map((u) => ({
          userId: u.id,
          email: u.email,
          displayName: u.displayName,
          role: ws.role,
        })),
      );
    }),
    http.get('/api/nodes', ({ request }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = requireWorkspace(request);
      if (!ws) return problem(403, 'Missing or invalid X-Workspace-Id');
      const url = new URL(request.url);
      const parentId = url.searchParams.get('parentId') ?? undefined;
      const kind = url.searchParams.get('kind') ?? undefined;
      return HttpResponse.json(listNodes(ctx.state, ws.id, parentId, kind));
    }),
    http.get('/api/nodes/:id', ({ request, params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = requireWorkspace(request);
      if (!ws) return problem(403, 'Missing or invalid X-Workspace-Id');
      const node = ctx.state.nodes.find(
        (n) => n.id === params.id && n.workspaceId === ws.id && !n.deletedAt,
      );
      if (!node) return problem(404, 'Node not found');
      return HttpResponse.json(node);
    }),
    http.post('/api/nodes', async ({ request }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = requireWorkspace(request);
      if (!ws) return problem(403, 'Missing or invalid X-Workspace-Id');
      if (ws.role === 'viewer') return problem(403, 'Read-only workspace');
      const body = (await request.json()) as CreateNodeRequest;
      return HttpResponse.json(createNode(ctx.state, ws.id, body), { status: 201 });
    }),
    http.patch('/api/nodes/:id', async ({ request, params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = requireWorkspace(request);
      if (!ws) return problem(403, 'Missing or invalid X-Workspace-Id');
      const body = (await request.json()) as UpdateNodeRequest;
      const node = updateNode(ctx.state, String(params.id), body);
      if (!node) return problem(404, 'Node not found');
      return HttpResponse.json(node);
    }),
    http.delete('/api/nodes/:id', ({ request, params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = requireWorkspace(request);
      if (!ws) return problem(403, 'Missing or invalid X-Workspace-Id');
      if (!deleteNode(ctx.state, String(params.id))) return problem(404, 'Node not found');
      return new HttpResponse(null, { status: 204 });
    }),

    // ---- §3 collab token
    http.get('/api/collab/token', ({ request }) => {
      const user = requireUser();
      if (!user) return problem(401, 'Not signed in');
      const nodeId = new URL(request.url).searchParams.get('nodeId');
      const node = ctx.state.nodes.find((n) => n.id === nodeId && !n.deletedAt);
      if (!node) return problem(404, 'Node not found');
      const role = node.effectiveRole === 'viewer' ? 'viewer' : 'editor';
      const token = fakeJwt({
        sub: user.id,
        name: user.displayName,
        color: '#2383e2',
        node: node.id,
        role,
        exp: Math.floor(Date.now() / 1000) + 600,
      });
      return HttpResponse.json({ token, wsUrl: '/collab' });
    }),
  ];
}
