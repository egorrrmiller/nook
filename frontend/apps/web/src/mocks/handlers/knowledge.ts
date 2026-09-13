// Owner: frontend-knowledge — contracts §9 (backlinks/links, tags, properties, aliases, full-text
// search, graph, export/import). Fill this with MSW handlers for `/api/nodes/{id}/{backlinks,links,
// tags,properties,aliases}`, `/api/tags*`, `/api/links/broken`, `/api/search`, `/api/graph`,
// `/api/export`, `/api/import*`. Helper functions go in ../db.ts below the
// `// --- knowledge helpers (frontend-knowledge) ---` marker.
import type { HttpHandler } from 'msw';
import type { MockContext } from './context';

export function createKnowledgeHandlers(_ctx: MockContext): HttpHandler[] {
  return [];
}
