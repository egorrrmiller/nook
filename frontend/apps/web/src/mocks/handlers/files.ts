// Owner: frontend-editor — contracts §8 (files, thumbnails, covers, link previews) plus the
// editor-facing parts of §9.7 (`/api/nodes/{id}/history*`, `/api/nodes/{id}/blocks`, `/api/blocks/{id}`)
// remove this block once frontend-shell implements it in tree.ts).
import { HttpResponse, http, type HttpHandler } from 'msw';
import type { Block, CoverItem, FileFromUrlRequest, Version } from '@nook/api-client';
import {
  countBlocksDeep,
  createAttachment,
  findBlock,
  getDocBlocks,
  linkPreviewFor,
  setDocBlocks,
  uuid,
  type MockSnapshot,
} from '../db';
import type { MockContext } from './context';

const GALLERY: CoverItem[] = [
  { id: 'gradient-lagoon', name: 'Lagoon', group: 'Gradients', url: '/covers/gradient-lagoon.svg', thumbUrl: '/covers/gradient-lagoon.svg' },
  { id: 'gradient-sunset', name: 'Sunset', group: 'Gradients', url: '/covers/gradient-sunset.svg', thumbUrl: '/covers/gradient-sunset.svg' },
  { id: 'solid-slate', name: 'Slate', group: 'Solid', url: '/covers/solid-slate.svg', thumbUrl: '/covers/solid-slate.svg' },
  { id: 'nature-dunes', name: 'Dunes', group: 'Nature', url: '/covers/nature-dunes.svg', thumbUrl: '/covers/nature-dunes.svg' },
  { id: 'pattern-grid', name: 'Grid', group: 'Patterns', url: '/covers/pattern-grid.svg', thumbUrl: '/covers/pattern-grid.svg' },
];

/** 1×1 transparent PNG, stands in for generated thumbnails. */
const PIXEL = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

export function createFilesHandlers(ctx: MockContext): HttpHandler[] {
  const { problem, requireUser, requireWorkspace } = ctx;

  const snapshot = (nodeId: string, kind: Version['kind']): MockSnapshot => {
    const doc = getDocBlocks(ctx.state, nodeId);
    const user = requireUser();
    const version = (ctx.state.snapshots.filter((s) => s.nodeId === nodeId).at(-1)?.version ?? 0) + 1;
    const entry: MockSnapshot = {
      id: uuid(),
      nodeId,
      version,
      takenAt: new Date().toISOString(),
      user: user ? { id: user.id, displayName: user.displayName } : null,
      title: doc.title || ctx.state.nodes.find((n) => n.id === nodeId)?.title || '',
      blockCount: countBlocksDeep(doc.blocks),
      kind,
      blocks: structuredClone(doc.blocks),
    };
    ctx.state.snapshots.push(entry);
    return entry;
  };

  return [
    // ---- §8 files
    http.post('/api/files', async ({ request }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = requireWorkspace(request);
      if (!ws) return problem(403, 'Missing or invalid X-Workspace-Id');
      const form = await request.formData();
      const file = form.get('file') as File | null;
      const nodeId = String(form.get('nodeId') ?? '');
      if (!file || typeof file === 'string') return problem(400, 'file is required');
      if (!nodeId) return problem(400, 'nodeId is required');
      const name = file.name || 'upload.bin';
      if (file.size > 512 * 1024 * 1024) return problem(413, 'File is too large');
      const attachment = createAttachment(
        ctx.state,
        ws.id,
        nodeId,
        { name, type: file.type, size: file.size, blob: file },
        {
          blockId: (form.get('blockId') as string) || undefined,
          propertyId: (form.get('propertyId') as string) || undefined,
          purpose: (form.get('purpose') as 'content' | 'icon' | 'cover') || 'content',
        },
      );
      const { workspaceId: _ws, data: _data, ...dto } = attachment;
      return HttpResponse.json(dto, { status: 201 });
    }),

    http.post('/api/files/from-url', async ({ request }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const ws = requireWorkspace(request);
      if (!ws) return problem(403, 'Missing or invalid X-Workspace-Id');
      const body = (await request.json()) as FileFromUrlRequest;
      if (!/^https?:\/\//i.test(body.url ?? '')) return problem(400, 'Only http(s) URLs are supported');
      const name = body.url.split('/').pop() || 'download';
      const mime = /\.(png|jpe?g|gif|webp)$/i.test(name)
        ? `image/${name.split('.').pop()!.toLowerCase().replace('jpg', 'jpeg')}`
        : /\.pdf$/i.test(name)
          ? 'application/pdf'
          : /\.mp4$/i.test(name)
            ? 'video/mp4'
            : 'application/octet-stream';
      const attachment = createAttachment(
        ctx.state,
        ws.id,
        body.nodeId,
        { name, type: mime, size: 24_000, blob: new Blob([PIXEL], { type: mime }) },
        { blockId: body.blockId, purpose: body.purpose ?? 'content' },
      );
      const { workspaceId: _ws, data: _data, ...dto } = attachment;
      return HttpResponse.json(dto, { status: 201 });
    }),

    http.get('/api/files/:id/meta', ({ params }) => {
      const a = ctx.state.attachments.find((x) => x.id === params.id);
      if (!a) return problem(404, 'Attachment not found');
      const { workspaceId: _ws, data: _data, ...dto } = a;
      return HttpResponse.json(dto);
    }),

    http.get('/api/files/:id/thumb', ({ params }) => {
      const a = ctx.state.attachments.find((x) => x.id === params.id);
      if (!a) return problem(404, 'Attachment not found');
      if (!a.mime.startsWith('image/')) return problem(404, 'Not an image');
      return new HttpResponse(a.data ?? new Blob([PIXEL as BlobPart], { type: 'image/png' }), {
        headers: { 'Content-Type': a.data ? a.mime : 'image/png', 'Cache-Control': 'private, max-age=31536000' },
      });
    }),

    http.get('/api/files/:id', ({ params }) => {
      const a = ctx.state.attachments.find((x) => x.id === params.id);
      if (!a) return problem(404, 'Attachment not found');
      return new HttpResponse(a.data ?? new Blob([PIXEL as BlobPart], { type: a.mime }), {
        headers: { 'Content-Type': a.mime, ETag: a.sha256, 'Content-Disposition': `inline; filename="${a.filename}"` },
      });
    }),

    http.delete('/api/files/:id', ({ params }) => {
      const i = ctx.state.attachments.findIndex((x) => x.id === params.id);
      if (i < 0) return problem(404, 'Attachment not found');
      ctx.state.attachments.splice(i, 1);
      return new HttpResponse(null, { status: 204 });
    }),

    http.get('/api/nodes/:id/files', ({ params }) =>
      HttpResponse.json(
        ctx.state.attachments.filter((a) => a.nodeId === params.id).map(({ workspaceId: _ws, data: _data, ...dto }) => dto),
      ),
    ),

    http.get('/api/covers', () => HttpResponse.json(GALLERY)),

    http.post('/api/links/preview', async ({ request }) => {
      const { url } = (await request.json()) as { url: string };
      const cached = ctx.state.linkPreviews[url];
      if (cached) return HttpResponse.json(cached);
      const preview = linkPreviewFor(url);
      ctx.state.linkPreviews[url] = preview;
      return HttpResponse.json(preview);
    }),

    // ---- §9.7 history & block reads
    http.get('/api/nodes/:id/history', ({ params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const items = ctx.state.snapshots
        .filter((s) => s.nodeId === params.id)
        .sort((a, b) => b.version - a.version)
        .map(({ blocks: _blocks, nodeId: _nodeId, ...v }) => v);
      return HttpResponse.json({ items, nextCursor: null });
    }),

    http.get('/api/nodes/:id/history/:versionId', ({ params }) => {
      const s = ctx.state.snapshots.find((x) => x.nodeId === params.id && x.id === params.versionId);
      if (!s) return problem(404, 'Version not found');
      return HttpResponse.json({ title: s.title, blocks: s.blocks, takenAt: s.takenAt, user: s.user });
    }),

    http.post('/api/nodes/:id/history', ({ params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const { blocks: _blocks, nodeId: _nodeId, ...v } = snapshot(String(params.id), 'manual');
      return HttpResponse.json(v, { status: 201 });
    }),

    http.post('/api/nodes/:id/history/:versionId/restore', ({ params }) => {
      if (!requireUser()) return problem(401, 'Not signed in');
      const nodeId = String(params.id);
      const target = ctx.state.snapshots.find((x) => x.nodeId === nodeId && x.id === params.versionId);
      if (!target) return problem(404, 'Version not found');
      // Contract: snapshot the current state first, then import the restored blocks.
      snapshot(nodeId, 'pre-restore');
      const version = setDocBlocks(nodeId, target.title, structuredClone(target.blocks));
      const node = ctx.state.nodes.find((n) => n.id === nodeId);
      if (node) {
        node.title = target.title;
        node.updatedAt = new Date().toISOString();
      }
      return HttpResponse.json({ version });
    }),

    http.get('/api/nodes/:id/blocks', ({ params }) => {
      const doc = getDocBlocks(ctx.state, String(params.id));
      return HttpResponse.json({ title: doc.title, blocks: doc.blocks, version: doc.version });
    }),

    // Mock-only: stands in for the collab service's `onStoreDocument` → `PUT /internal/documents/{id}`
    // (contracts §3). The real frontend never calls this; `useMockDocSync` does, in mock mode only.
    http.put('/api/nodes/:id/blocks', async ({ request, params }) => {
      const body = (await request.json()) as { title?: string; blocks: Block[] };
      const version = setDocBlocks(String(params.id), body.title ?? '', body.blocks ?? []);
      return HttpResponse.json({ version });
    }),

    http.get('/api/blocks/:blockId', ({ params }) => {
      for (const node of ctx.state.nodes) {
        const doc = getDocBlocks(ctx.state, node.id);
        const block = findBlock(doc.blocks, String(params.blockId));
        if (block) return HttpResponse.json({ nodeId: node.id, block, breadcrumb: [] });
      }
      return problem(404, 'Block not found');
    }),

  ];
}
