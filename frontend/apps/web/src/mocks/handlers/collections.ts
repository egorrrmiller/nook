import { HttpResponse, http, type HttpHandler } from 'msw';
import type { CollectionDocument, CollectionRowPropertyPatch, CollectionViewPatch } from '../../features/collections/model';
import type { MockContext } from './context';

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function createCollectionHandlers(ctx: MockContext): HttpHandler[] {
  return [
    http.get('/api/collections/:id', ({ request, params }) => {
      const user = ctx.requireUser();
      const workspace = ctx.requireWorkspace(request);
      if (!user) return ctx.problem(401, 'Not signed in');
      if (!workspace) return ctx.problem(403, 'Missing or invalid X-Workspace-Id');
      const collection = ctx.state.collections.find((item) => item.id === params.id || item.nodeId === params.id);
      if (!collection || !ctx.state.nodes.some((node) => node.id === collection.nodeId && node.workspaceId === workspace.id && !node.deletedAt)) return ctx.problem(404, 'Collection not found');
      return HttpResponse.json(collection);
    }),
    http.patch('/api/collections/:collectionId/rows/:rowId/properties', async ({ request, params }) => {
      const user = ctx.requireUser();
      const workspace = ctx.requireWorkspace(request);
      if (!user) return ctx.problem(401, 'Not signed in');
      if (!workspace) return ctx.problem(403, 'Missing or invalid X-Workspace-Id');
      const collection = ctx.state.collections.find((item) => item.id === params.collectionId || item.nodeId === params.collectionId);
      const row = collection?.rows.find((item) => item.id === params.rowId);
      if (!collection || !row) return ctx.problem(404, 'Collection row not found');
      if (workspace.role === 'viewer') return ctx.problem(403, 'Read-only workspace');
      const body = (await request.json().catch(() => ({}))) as Partial<CollectionRowPropertyPatch>;
      if (!body.propertyId || !Object.prototype.hasOwnProperty.call(body, 'value')) return ctx.problem(400, 'propertyId and value are required');
      // JSON is kept verbatim, including objects belonging to property types unknown to this UI.
      row.properties[body.propertyId] = body.value as CollectionDocument['rows'][number]['properties'][string];
      row.updatedAt = new Date().toISOString();
      return HttpResponse.json(row);
    }),
    http.patch('/api/collections/:collectionId/views/:viewId', async ({ request, params }) => {
      const user = ctx.requireUser();
      const workspace = ctx.requireWorkspace(request);
      if (!user) return ctx.problem(401, 'Not signed in');
      if (!workspace) return ctx.problem(403, 'Missing or invalid X-Workspace-Id');
      const collection = ctx.state.collections.find((item) => item.id === params.collectionId || item.nodeId === params.collectionId);
      const view = collection?.views.find((item) => item.id === params.viewId);
      if (!collection || !view) return ctx.problem(404, 'Collection view not found');
      if (workspace.role === 'viewer') return ctx.problem(403, 'Read-only workspace');
      const body = (await request.json().catch(() => ({}))) as Partial<CollectionViewPatch>;
      if (!isJsonObject(body.config)) return ctx.problem(400, 'config is required');
      view.config = body.config as CollectionViewPatch['config'];
      return HttpResponse.json(view);
    }),
  ];
}

