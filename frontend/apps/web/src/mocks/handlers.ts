import { HttpResponse, http, type HttpHandler } from 'msw';
import type {
  CreateNodeRequest,
  LoginRequest,
  RegisterRequest,
  UpdateNodeRequest,
} from '@nook/api-client';
import {
  authResponse,
  createMockState,
  createNode,
  deleteNode,
  fakeJwt,
  listNodes,
  toUser,
  updateNode,
  uuid,
  type MockState,
} from './db';

export interface MockApi {
  state: MockState;
  handlers: HttpHandler[];
  reset(): void;
}

const problem = (status: number, title: string) =>
  HttpResponse.json({ type: 'about:blank', title, status }, { status });

export function createMockApi(initial?: () => MockState): MockApi {
  let state = initial ? initial() : createMockState();

  const requireUser = () => {
    const u = state.users.find((x) => x.id === state.sessionUserId);
    return u ?? null;
  };

  const requireWorkspace = (request: Request) => {
    const id = request.headers.get('x-workspace-id');
    if (!id) return null;
    return state.workspaces.find((w) => w.id === id) ?? null;
  };

  const handlers: HttpHandler[] = [
    http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),

    // ---- §1 identity & auth
    http.post('/api/auth/login', async ({ request }) => {
      const body = (await request.json()) as LoginRequest;
      const user = state.users.find(
        (u) => u.email.toLowerCase() === body.email?.toLowerCase() && u.password === body.password,
      );
      if (!user) return problem(401, 'Invalid email or password');
      state.sessionUserId = user.id;
      return HttpResponse.json(authResponse(state, user));
    }),
    http.post('/api/auth/logout', () => {
      state.sessionUserId = null;
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/auth/invite/:code', ({ params }) => {
      const inv = state.invites.find((i) => i.code === params.code);
      const valid = !!inv && new Date(inv.expiresAt).getTime() > Date.now();
      return HttpResponse.json({ valid, email: inv?.email });
    }),
    http.post('/api/auth/register', async ({ request }) => {
      const body = (await request.json()) as RegisterRequest;
      const inv = state.invites.find((i) => i.code === body.inviteCode);
      if (!inv) return problem(400, 'Invalid invite code');
      if (new Date(inv.expiresAt).getTime() < Date.now()) return problem(410, 'Invite expired');
      if (!body.email || !body.password || body.password.length < 8)
        return problem(400, 'Password must be at least 8 characters');
      if (state.users.some((u) => u.email.toLowerCase() === body.email.toLowerCase()))
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
      state.users.push(user);
      state.workspaces.push({
        id: uuid(),
        name: `${user.displayName}'s Nook`,
        icon: null,
        role: 'owner',
        isPersonal: true,
      });
      state.invites = state.invites.filter((i) => i !== inv);
      state.sessionUserId = user.id;
      return HttpResponse.json(authResponse(state, user));
    }),
    http.get('/api/me', () => {
      const user = requireUser();
      if (!user) return problem(401, 'Not signed in');
      return HttpResponse.json(authResponse(state, user));
    }),
    http.post('/api/invites', async ({ request }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const body = (await request.json().catch(() => ({}))) as {
        email?: string;
        expiresInHours?: number;
      };
      const code = uuid().slice(0, 8);
      const expiresAt = new Date(Date.now() + (body.expiresInHours ?? 72) * 36e5).toISOString();
      state.invites.push({ code, email: body.email, expiresAt });
      return HttpResponse.json(
        { code, url: `${new URL(request.url).origin}/register?invite=${code}`, expiresAt },
        { status: 201 },
      );
    }),

    // ---- §2 workspaces & nodes
    http.get('/api/workspaces', () => {
      if (!requireUser()) return problem(401, 'Not signed in');
      return HttpResponse.json(state.workspaces);
    }),
    http.post('/api/workspaces', async ({ request }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const body = (await request.json()) as { name: string; icon?: string };
      const ws = {
        id: uuid(),
        name: body.name,
        icon: body.icon ?? null,
        role: 'owner' as const,
        isPersonal: false,
      };
      state.workspaces.push(ws);
      return HttpResponse.json(ws, { status: 201 });
    }),
    http.get('/api/workspaces/:id/members', ({ params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = state.workspaces.find((w) => w.id === params.id);
      if (!ws) return problem(404, 'Workspace not found');
      return HttpResponse.json(
        state.users.map((u) => ({
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
      return HttpResponse.json(listNodes(state, ws.id, parentId, kind));
    }),
    http.get('/api/nodes/:id', ({ request, params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = requireWorkspace(request);
      if (!ws) return problem(403, 'Missing or invalid X-Workspace-Id');
      const node = state.nodes.find(
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
      return HttpResponse.json(createNode(state, ws.id, body), { status: 201 });
    }),
    http.patch('/api/nodes/:id', async ({ request, params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = requireWorkspace(request);
      if (!ws) return problem(403, 'Missing or invalid X-Workspace-Id');
      const body = (await request.json()) as UpdateNodeRequest;
      const node = updateNode(state, String(params.id), body);
      if (!node) return problem(404, 'Node not found');
      return HttpResponse.json(node);
    }),
    http.delete('/api/nodes/:id', ({ request, params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = requireWorkspace(request);
      if (!ws) return problem(403, 'Missing or invalid X-Workspace-Id');
      if (!deleteNode(state, String(params.id))) return problem(404, 'Node not found');
      return new HttpResponse(null, { status: 204 });
    }),

    // ---- §3 collab token
    http.get('/api/collab/token', ({ request }) => {
      const user = requireUser();
      if (!user) return problem(401, 'Not signed in');
      const nodeId = new URL(request.url).searchParams.get('nodeId');
      const node = state.nodes.find((n) => n.id === nodeId && !n.deletedAt);
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

  return {
    get state() {
      return state;
    },
    handlers,
    reset() {
      state = initial ? initial() : createMockState();
    },
  };
}

export const mockApi = createMockApi();
export const handlers = mockApi.handlers;
export { toUser };
