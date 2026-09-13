// Owner: frontend-editor — contracts §8 (files, thumbnails, covers, link previews) plus the
// editor-facing parts of §9.7 (`/api/nodes/{id}/history*`, `/api/nodes/{id}/blocks`, `/api/blocks/{id}`).
// Fill this with MSW handlers for `/api/files*`, `/api/nodes/{id}/files`, `/api/covers`,
// `/api/links/preview`. Helper functions go in ../db.ts below the
// `// --- files helpers (frontend-editor) ---` marker.
import type { HttpHandler } from 'msw';
import type { MockContext } from './context';

export function createFilesHandlers(_ctx: MockContext): HttpHandler[] {
  return [];
}
