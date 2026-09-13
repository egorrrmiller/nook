// Owner: frontend-shell — contracts §7 (tree, trash, favorites, recents, quick find, account/settings).
// Fill this with MSW handlers for `/api/nodes/{id}/{ancestors,duplicate,archive,unarchive}`,
// `/api/trash`, `/api/favorites`, `/api/recents`, `/api/search/quick`, `/api/me/*`,
// `/api/workspaces/{id}/{settings,…}`, `/api/invites` (list/remove). Helper functions go in
// ../db.ts below the `// --- tree helpers (frontend-shell) ---` marker.
import type { HttpHandler } from 'msw';
import type { MockContext } from './context';

export function createTreeHandlers(_ctx: MockContext): HttpHandler[] {
  return [];
}
