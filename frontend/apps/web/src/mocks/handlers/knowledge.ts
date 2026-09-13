// Owner: frontend-knowledge — contracts §9 (backlinks/links, tags, properties, aliases, full-text
// search, graph, export/import). Helpers + seeds live in ../db.ts below the
// `// --- knowledge helpers (frontend-knowledge) ---` marker.
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from 'msw';
import type {
  Backlink,
  BrokenLink,
  CreateTagRequest,
  ExportRequest,
  GraphEdge,
  GraphNode,
  ImportResult,
  Node,
  OutgoingLink,
  PageProperties,
  PageProperty,
  PatchPagePropertiesRequest,
  SearchHit,
  SearchRequest,
  SetNodeTagsRequest,
  Tag,
  UpdateTagRequest,
} from '@nook/api-client';
import {
  liveBreadcrumbOf,
  buildZip,
  createNode,
  importJobs,
  isBrokenLink,
  isDescendantOf,
  liveNode,
  makeSnippet,
  nodePlainBlocks,
  nodeSummary,
  nodeTagsOf,
  paragraph,
  parseSearchQuery,
  recountTags,
  scoreHit,
  seedKnowledge,
  textMatches,
  uuid,
  type MockState,
  type MockTag,
} from '../db';
import type { MockContext } from './context';

const PROPERTY_TYPES = new Set(['text', 'number', 'checkbox', 'date', 'select', 'multi_select', 'url', 'email', 'phone']);

function validProperty(p: unknown): p is PageProperty {
  if (!p || typeof p !== 'object') return false;
  const { type, value } = p as PageProperty;
  if (!PROPERTY_TYPES.has(type)) return false;
  if (value === null || value === undefined) return true;
  switch (type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'checkbox':
      return typeof value === 'boolean';
    case 'multi_select':
      return Array.isArray(value) && value.every((v) => typeof v === 'string');
    case 'date':
      return typeof value === 'object' && !Array.isArray(value) && /^\d{4}-\d{2}-\d{2}/.test(String((value as { start: string }).start));
    default:
      return typeof value === 'string';
  }
}

function tagOf(t: MockTag): Tag {
  return { id: t.id, name: t.name, color: t.color ?? null, count: t.count ?? 0 };
}

function titleFromMarkdown(text: string, fallback: string): string {
  const m = /^#\s+(.+)$/m.exec(text);
  return (m?.[1] ?? fallback).trim();
}

function importOne(state: MockState, workspaceId: string, file: File, parentId: string | null): ImportResult {
  const name = file.name || 'import';
  const base = name.replace(/\.[^.]+$/, '');
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  const warnings: string[] = [];
  const nodeIds: string[] = [];
  const mkPage = (title: string, text: string[], parent: string | null) => {
    const node = createNode(state, workspaceId, { kind: 'page', title, parentId: parent });
    state.snapshots.push({
      id: uuid(),
      nodeId: node.id,
      version: 1,
      takenAt: new Date().toISOString(),
      user: null,
      title,
      blockCount: text.length,
      kind: 'auto',
      blocks: text.map((t) => paragraph(t)),
    });
    nodeIds.push(node.id);
    return node;
  };
  switch (ext) {
    case 'zip': {
      const root = mkPage(base, ['Imported archive root.'], parentId);
      mkPage('Chapter 1', ['First imported chapter.'], root.id);
      mkPage('Chapter 2', ['Second imported chapter.'], root.id);
      warnings.push('Skipped 1 unsupported file: notes.canvas');
      break;
    }
    case 'csv':
      mkPage(base, ['(table block with the CSV rows)'], parentId);
      break;
    default:
      mkPage(
        titleFromMarkdown(file.text, base),
        file.text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).slice(0, 20),
        parentId,
      );
      if (ext === 'html') warnings.push('Inline styles were dropped');
  }
  return { pagesCreated: nodeIds.length, nodeIds, warnings };
}

type File = { name: string; size: number; text: string };

export function createKnowledgeHandlers(ctx: MockContext): HttpHandler[] {
  const { problem, requireUser, requireWorkspace } = ctx;

  /** Auth + workspace + lazy seed, shared by every handler. */
  type Guard = { ws: { id: string; role: string } } | HttpResponse<JsonBodyType>;
  const guard = (request: Request): Guard => {
    if (!requireUser()) return problem(401, 'Not signed in');
    const ws = requireWorkspace(request);
    if (!ws) return problem(403, 'Missing or invalid X-Workspace-Id');
    seedKnowledge(ctx.state);
    return { ws };
  };
  const isResponse = (g: Guard): g is HttpResponse<JsonBodyType> => g instanceof HttpResponse;
  const nodeIn = (wsId: string, id: unknown): Node | undefined => {
    const n = liveNode(ctx.state, String(id));
    return n && n.workspaceId === wsId ? n : undefined;
  };

  return [
    // ---- §9.1 links & backlinks
    http.get('/api/nodes/:id/backlinks', ({ request, params }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const node = nodeIn(g.ws.id, params.id);
      if (!node) return problem(404, 'Node not found');
      const out: Backlink[] = [];
      for (const l of ctx.state.links) {
        if (l.targetNodeId !== node.id) continue;
        const src = liveNode(ctx.state, l.sourceNodeId);
        if (!src) continue;
        out.push({ sourceNode: nodeSummary(src), blockId: l.blockId, kind: l.kind, snippet: l.snippet.slice(0, 200) });
      }
      return HttpResponse.json(out);
    }),
    http.get('/api/nodes/:id/links', ({ request, params }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const node = nodeIn(g.ws.id, params.id);
      if (!node) return problem(404, 'Node not found');
      const out: OutgoingLink[] = ctx.state.links
        .filter((l) => l.sourceNodeId === node.id)
        .map((l) => {
          const target = liveNode(ctx.state, l.targetNodeId);
          return {
            targetNode: target ? nodeSummary(target) : null,
            targetBlockId: l.targetBlockId,
            kind: l.kind,
            href: l.href,
            broken: isBrokenLink(ctx.state, l),
          };
        });
      return HttpResponse.json(out);
    }),
    http.get('/api/links/broken', ({ request }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const limit = Number(new URL(request.url).searchParams.get('limit') ?? 100);
      const out: BrokenLink[] = [];
      for (const l of ctx.state.links) {
        if (!isBrokenLink(ctx.state, l)) continue;
        const src = liveNode(ctx.state, l.sourceNodeId);
        if (!src || src.workspaceId !== g.ws.id) continue;
        out.push({ sourceNode: nodeSummary(src), blockId: l.blockId ?? '', href: l.href, targetNodeId: l.targetNodeId ?? undefined });
        if (out.length >= limit) break;
      }
      return HttpResponse.json(out);
    }),

    // ---- §9.2 tags
    http.get('/api/tags', ({ request }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      recountTags(ctx.state);
      const list = ctx.state.tags
        .filter((t) => t.workspaceId === g.ws.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(tagOf);
      return HttpResponse.json(list);
    }),
    http.post('/api/tags', async ({ request }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const body = (await request.json()) as CreateTagRequest;
      const name = body.name?.trim();
      if (!name) return problem(400, 'Tag name is required');
      if (ctx.state.tags.some((t) => t.workspaceId === g.ws.id && t.name.toLowerCase() === name.toLowerCase()))
        return problem(409, 'A tag with this name already exists');
      const tag: MockTag = { id: uuid(), workspaceId: g.ws.id, name, color: body.color ?? null, count: 0 };
      ctx.state.tags.push(tag);
      return HttpResponse.json(tagOf(tag), { status: 201 });
    }),
    http.patch('/api/tags/:id', async ({ request, params }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const tag = ctx.state.tags.find((t) => t.id === params.id && t.workspaceId === g.ws.id);
      if (!tag) return problem(404, 'Tag not found');
      const body = (await request.json()) as UpdateTagRequest;
      if (body.name !== undefined) {
        const name = body.name.trim();
        if (ctx.state.tags.some((t) => t !== tag && t.workspaceId === g.ws.id && t.name.toLowerCase() === name.toLowerCase()))
          return problem(409, 'A tag with this name already exists');
        tag.name = name;
      }
      if (body.color !== undefined) tag.color = body.color;
      recountTags(ctx.state);
      return HttpResponse.json(tagOf(tag));
    }),
    http.delete('/api/tags/:id', ({ request, params }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const i = ctx.state.tags.findIndex((t) => t.id === params.id && t.workspaceId === g.ws.id);
      if (i < 0) return problem(404, 'Tag not found');
      ctx.state.tags.splice(i, 1);
      ctx.state.nodeTags = ctx.state.nodeTags.filter((nt) => nt.tagId !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/tags/:id/nodes', ({ request, params }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const url = new URL(request.url);
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const cursor = Number(url.searchParams.get('cursor') ?? 0);
      const ids = [...new Set(ctx.state.nodeTags.filter((nt) => nt.tagId === params.id).map((nt) => nt.nodeId))];
      const items = ids.map((id) => nodeIn(g.ws.id, id)).filter((n): n is Node => !!n);
      const page = items.slice(cursor, cursor + limit);
      return HttpResponse.json({ items: page, nextCursor: cursor + limit < items.length ? String(cursor + limit) : undefined });
    }),
    http.get('/api/nodes/:id/tags', ({ request, params }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const node = nodeIn(g.ws.id, params.id);
      if (!node) return problem(404, 'Node not found');
      return HttpResponse.json(nodeTagsOf(ctx.state, node.id));
    }),
    http.put('/api/nodes/:id/tags', async ({ request, params }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const node = nodeIn(g.ws.id, params.id);
      if (!node) return problem(404, 'Node not found');
      const body = (await request.json()) as SetNodeTagsRequest;
      const ids = new Set<string>();
      for (const id of body.tagIds ?? []) if (ctx.state.tags.some((t) => t.id === id && t.workspaceId === g.ws.id)) ids.add(id);
      for (const raw of body.names ?? []) {
        const name = raw.trim();
        if (!name) continue;
        let tag = ctx.state.tags.find((t) => t.workspaceId === g.ws.id && t.name.toLowerCase() === name.toLowerCase());
        if (!tag) {
          tag = { id: uuid(), workspaceId: g.ws.id, name, color: null, count: 0 };
          ctx.state.tags.push(tag);
        }
        ids.add(tag.id);
      }
      ctx.state.nodeTags = ctx.state.nodeTags.filter((nt) => !(nt.nodeId === node.id && nt.source === 'manual'));
      for (const id of ids) ctx.state.nodeTags.push({ nodeId: node.id, tagId: id, source: 'manual' });
      recountTags(ctx.state);
      return HttpResponse.json(nodeTagsOf(ctx.state, node.id).filter((t) => t.source === 'manual').map(({ source: _s, ...t }) => t));
    }),

    // ---- §9.3 properties
    http.get('/api/nodes/:id/properties', ({ request, params }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const node = nodeIn(g.ws.id, params.id);
      if (!node) return problem(404, 'Node not found');
      return HttpResponse.json(node.properties ?? {});
    }),
    http.put('/api/nodes/:id/properties', async ({ request, params }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const node = nodeIn(g.ws.id, params.id);
      if (!node) return problem(404, 'Node not found');
      const body = (await request.json()) as PageProperties;
      for (const [name, p] of Object.entries(body)) if (!name.trim() || !validProperty(p)) return problem(400, `Invalid property "${name}"`);
      node.properties = body;
      node.updatedAt = new Date().toISOString();
      return HttpResponse.json(node.properties);
    }),
    http.patch('/api/nodes/:id/properties', async ({ request, params }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const node = nodeIn(g.ws.id, params.id);
      if (!node) return problem(404, 'Node not found');
      const body = (await request.json()) as PatchPagePropertiesRequest;
      const next: PageProperties = { ...(node.properties ?? {}) };
      for (const [name, p] of Object.entries(body)) {
        if (p === null || p === undefined) delete next[name];
        else if (!name.trim() || !validProperty(p)) return problem(400, `Invalid property "${name}"`);
        else next[name] = p;
      }
      node.properties = next;
      node.updatedAt = new Date().toISOString();
      return HttpResponse.json(next);
    }),

    // ---- §9.4 aliases
    http.get('/api/nodes/:id/aliases', ({ request, params }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const node = nodeIn(g.ws.id, params.id);
      if (!node) return problem(404, 'Node not found');
      return HttpResponse.json(ctx.state.aliases.filter((a) => a.nodeId === node.id).map((a) => a.value));
    }),
    http.put('/api/nodes/:id/aliases', async ({ request, params }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const node = nodeIn(g.ws.id, params.id);
      if (!node) return problem(404, 'Node not found');
      const body = (await request.json()) as { aliases: string[] };
      const aliases = [...new Set((body.aliases ?? []).map((a) => a.trim()).filter(Boolean))];
      for (const alias of aliases) {
        const clash = ctx.state.aliases.find(
          (a) => a.workspaceId === g.ws.id && a.nodeId !== node.id && a.value.toLowerCase() === alias.toLowerCase(),
        );
        const other = clash ? liveNode(ctx.state, clash.nodeId) : undefined;
        if (clash && other)
          return HttpResponse.json(
            {
              type: 'about:blank',
              title: `Alias "${alias}" is already used by "${other.title}"`,
              status: 409,
              conflicts: [{ alias, node: nodeSummary(other) }],
            },
            { status: 409 },
          );
      }
      ctx.state.aliases = ctx.state.aliases.filter((a) => a.nodeId !== node.id);
      for (const value of aliases) ctx.state.aliases.push({ workspaceId: g.ws.id, nodeId: node.id, value });
      return HttpResponse.json(aliases);
    }),

    // ---- §9.5 full-text search
    http.post('/api/search', async ({ request }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const body = (await request.json()) as SearchRequest;
      const q = parseSearchQuery(body.query ?? '');
      const f = body.filters ?? {};
      const titleOnly = !!f.titleOnly || (q.terms.length === 0 && q.phrases.length === 0 && q.titleTerms.length > 0);
      const hits: SearchHit[] = [];
      const inRange = (iso: string, from?: string, to?: string) =>
        (!from || iso >= from) && (!to || iso <= `${to.length === 10 ? `${to}T23:59:59.999Z` : to}`);
      for (const node of ctx.state.nodes) {
        if (node.workspaceId !== g.ws.id || node.deletedAt) continue;
        if (node.archivedAt && !f.includeArchived) continue;
        if (f.kinds?.length && !f.kinds.includes(node.kind)) continue;
        if (f.tagIds?.length && !f.tagIds.some((id) => ctx.state.nodeTags.some((nt) => nt.nodeId === node.id && nt.tagId === id))) continue;
        if (!inRange(node.createdAt, f.createdFrom, f.createdTo)) continue;
        if (!inRange(node.updatedAt, f.updatedFrom, f.updatedTo)) continue;
        if (body.scope?.ancestorId && node.id !== body.scope.ancestorId && !isDescendantOf(ctx.state, node, body.scope.ancestorId)) continue;

        const titleQ = { ...q, terms: [...q.terms, ...q.titleTerms], titleTerms: [] };
        const contentQ = { ...q, titleTerms: [] };
        if (q.titleTerms.length && !q.titleTerms.every((t) => node.title.toLowerCase().includes(t))) continue;
        const base = { node, breadcrumb: liveBreadcrumbOf(ctx.state, node) };
        if (textMatches(node.title, titleQ)) {
          hits.push({ ...base, snippet: makeSnippet(node.title, titleQ), score: scoreHit(node, 'title', q), matchedIn: 'title' });
          continue;
        }
        const alias = ctx.state.aliases.find((a) => a.nodeId === node.id && textMatches(a.value, titleQ));
        if (alias) {
          hits.push({ ...base, snippet: makeSnippet(alias.value, titleQ), score: scoreHit(node, 'alias', q), matchedIn: 'alias' });
          continue;
        }
        if (titleOnly) continue;
        const block = nodePlainBlocks(ctx.state, node.id).find((b) => textMatches(b.text, contentQ));
        if (block) {
          hits.push({ ...base, blockId: block.blockId, snippet: makeSnippet(block.text, contentQ), score: scoreHit(node, 'content', q), matchedIn: 'content' });
          continue;
        }
        if (f.includeFiles) {
          const att = ctx.state.attachments.find((a) => a.nodeId === node.id && textMatches(a.filename, contentQ));
          if (att) hits.push({ ...base, attachment: att, snippet: makeSnippet(att.filename, contentQ), score: scoreHit(node, 'file', q), matchedIn: 'file' });
        }
      }
      const sort = body.sort ?? 'relevance';
      hits.sort((a, b) =>
        sort === 'updated'
          ? b.node.updatedAt.localeCompare(a.node.updatedAt)
          : sort === 'created'
            ? b.node.createdAt.localeCompare(a.node.createdAt)
            : b.score - a.score || a.node.title.localeCompare(b.node.title),
      );
      const limit = Math.min(100, Math.max(1, body.limit ?? 20));
      const offset = Number(body.cursor ?? 0) || 0;
      const page = hits.slice(offset, offset + limit);
      return HttpResponse.json({ hits: page, nextCursor: offset + limit < hits.length ? String(offset + limit) : undefined, total: hits.length });
    }),

    // ---- §9.6 graph
    http.get('/api/graph', ({ request }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const url = new URL(request.url);
      const rootId = url.searchParams.get('rootId');
      const depth = Number(url.searchParams.get('depth') ?? 2);
      const includeTags = url.searchParams.get('includeTags') !== 'false';
      const all = ctx.state.nodes.filter((n) => n.workspaceId === g.ws.id && !n.deletedAt);
      const edges: GraphEdge[] = [];
      for (const n of all) if (n.parentId && all.some((p) => p.id === n.parentId)) edges.push({ source: n.parentId, target: n.id, kind: 'parent' });
      for (const l of ctx.state.links) {
        if (!l.targetNodeId || l.kind === 'url') continue;
        if (all.some((n) => n.id === l.sourceNodeId) && all.some((n) => n.id === l.targetNodeId))
          edges.push({ source: l.sourceNodeId, target: l.targetNodeId, kind: l.kind });
      }
      if (includeTags) for (const nt of ctx.state.nodeTags) if (all.some((n) => n.id === nt.nodeId)) edges.push({ source: nt.nodeId, target: nt.tagId, kind: 'tag' });

      let keep = new Set(all.map((n) => n.id));
      if (rootId && keep.has(rootId)) {
        keep = new Set([rootId]);
        let frontier = [rootId];
        for (let d = 0; d < depth; d++) {
          const next: string[] = [];
          for (const e of edges) {
            if (e.kind === 'tag') continue;
            if (frontier.includes(e.source) && !keep.has(e.target)) { keep.add(e.target); next.push(e.target); }
            if (frontier.includes(e.target) && !keep.has(e.source)) { keep.add(e.source); next.push(e.source); }
          }
          frontier = next;
        }
      }
      const degree = new Map<string, number>();
      const kept = edges.filter((e) => keep.has(e.source) && (keep.has(e.target) || e.kind === 'tag'));
      for (const e of kept) {
        degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
        degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
      }
      const nodes: GraphNode[] = all
        .filter((n) => keep.has(n.id))
        .map((n) => ({
          id: n.id,
          title: n.title,
          icon: n.icon ?? null,
          kind: n.kind,
          degree: degree.get(n.id) ?? 0,
          tagIds: ctx.state.nodeTags.filter((nt) => nt.nodeId === n.id).map((nt) => nt.tagId),
        }));
      return HttpResponse.json({ nodes, edges: kept, truncated: false });
    }),

    // ---- §9.8 export
    http.post('/api/export', async ({ request }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const body = (await request.json()) as ExportRequest;
      const roots = body.nodeIds.map((id) => nodeIn(g.ws.id, id)).filter((n): n is Node => !!n);
      if (!roots.length) return problem(404, 'Nothing to export');
      const ext = body.format === 'html' ? 'html' : 'md';
      const files: { name: string; content: string }[] = [];
      const walk = (n: Node, dir: string) => {
        const text = nodePlainBlocks(ctx.state, n.id).map((b) => b.text).join('\n\n');
        const title = n.title || 'Untitled';
        files.push({
          name: `${dir}${title}.${ext}`,
          content:
            ext === 'md'
              ? `---\ntitle: ${title}\nid: ${n.id}\n---\n\n# ${title}\n\n${text}\n`
              : `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:sans-serif;max-width:720px;margin:40px auto}</style></head><body><h1>${title}</h1><p>${text}</p></body></html>`,
        });
        if (body.includeChildren) for (const c of ctx.state.nodes.filter((c) => c.parentId === n.id && !c.deletedAt)) walk(c, `${dir}${title}/`);
      };
      roots.forEach((r) => walk(r, ''));
      if (body.includeFiles) files.push({ name: 'files/README.txt', content: 'Attachments would be here.' });
      const name = roots.length === 1 ? roots[0]!.title || 'Untitled' : 'workspace';
      return new HttpResponse(buildZip(files), {
        status: 200,
        headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}-export.zip"` },
      });
    }),

    // ---- §9.8 import (+ 202 job path for big archives)
    http.post('/api/import', async ({ request }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const form = await request.formData();
      const raw = form.get('file');
      if (!(raw instanceof Blob)) return problem(400, 'file is required');
      const parentId = (form.get('parentId') as string | null) || null;
      if (parentId && !nodeIn(g.ws.id, parentId)) return problem(404, 'Parent not found');
      const name = raw instanceof File ? raw.name : 'import.md';
      const ext = (name.split('.').pop() ?? '').toLowerCase();
      if (!['md', 'markdown', 'txt', 'html', 'csv', 'zip'].includes(ext)) return problem(415, `Unsupported file type .${ext}`);
      const text = ext === 'zip' ? '' : await raw.text();
      const file: File = { name, size: raw.size, text };
      // Big archives (> 20 MB in the contract; the mock also honours a "large" filename for tests).
      if (raw.size > 20 * 1024 * 1024 || /large/i.test(name)) {
        const id = uuid();
        importJobs.set(id, { id, polls: 0, result: importOne(ctx.state, g.ws.id, file, parentId) });
        return HttpResponse.json({ jobId: id }, { status: 202 });
      }
      return HttpResponse.json(importOne(ctx.state, g.ws.id, file, parentId));
    }),
    http.get('/api/import/:jobId', ({ request, params }) => {
      const g = guard(request);
      if (isResponse(g)) return g;
      const job = importJobs.get(String(params.jobId));
      if (!job) return problem(404, 'Job not found');
      job.polls += 1;
      if (job.polls === 1) return HttpResponse.json({ status: 'queued' });
      if (job.polls === 2) return HttpResponse.json({ status: 'running' });
      return HttpResponse.json({ status: 'done', result: job.result });
    }),
  ];
}
