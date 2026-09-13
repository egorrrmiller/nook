import { describe, expect, it, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { ApiError, createApiClient } from '@nook/api-client';
import { server } from '../mocks/server';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/workspace';
import { signInMock, firstWorkspaceId } from './render';

describe('X-Workspace-Id injection', () => {
  beforeEach(() => signInMock());

  it('sends the active workspace id on every request', async () => {
    let seen: string | null = null;
    server.use(
      http.get('/api/nodes', ({ request }) => {
        seen = request.headers.get('x-workspace-id');
        return HttpResponse.json([]);
      }),
    );
    useWorkspaceStore.getState().setActive('ws-123');
    await api.nodes.list();
    expect(seen).toBe('ws-123');
  });

  it('omits the header when no workspace is active and the server answers 403', async () => {
    useWorkspaceStore.getState().setActive(null);
    await expect(api.nodes.list()).rejects.toMatchObject({ status: 403 });
  });

  it('lists nodes for the active workspace and exposes typed errors', async () => {
    useWorkspaceStore.getState().setActive(firstWorkspaceId());
    const nodes = await api.nodes.list();
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((n) => n.workspaceId === firstWorkspaceId())).toBe(true);
    const err = await api.nodes.get('missing').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });

  it('uses credentials: include and a custom getter', async () => {
    const calls: RequestInit[] = [];
    const client = createApiClient({
      baseUrl: '',
      getWorkspaceId: () => 'ws-custom',
      fetch: (input, init) => {
        calls.push(init ?? {});
        return fetch(input, init);
      },
    });
    await client.health();
    expect(calls[0]?.credentials).toBe('include');
    expect(new Headers(calls[0]?.headers).get('X-Workspace-Id')).toBe('ws-custom');
  });
});
