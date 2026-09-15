// Composes the per-slice MSW handler sets (contracts §11.3): core (§1–§3, coordinator-owned),
// tree (§7, frontend-shell), files (§8, frontend-editor), knowledge (§9, frontend-knowledge).
// Order matters for MSW: the first matching handler wins, so the slice files are listed after
// core and must not re-declare a core route.
import { HttpResponse, type HttpHandler } from 'msw';
import { createMockState, toUser, type MockState } from '../db';
import type { MockContext } from './context';
import { createCoreHandlers } from './core';
import { createTreeHandlers } from './tree';
import { createFilesHandlers } from './files';
import { createKnowledgeHandlers } from './knowledge';
import { createCollectionHandlers } from './collections';

export type { MockContext } from './context';

export interface MockApi {
  state: MockState;
  handlers: HttpHandler[];
  reset(): void;
}

export function createMockApi(initial?: () => MockState): MockApi {
  let state = initial ? initial() : createMockState();

  const ctx: MockContext = {
    get state() {
      return state;
    },
    problem: (status, title) =>
      HttpResponse.json({ type: 'about:blank', title, status }, { status }),
    requireUser: () => state.users.find((x) => x.id === state.sessionUserId) ?? null,
    requireWorkspace: (request) => {
      const id = request.headers.get('x-workspace-id');
      if (!id) return null;
      return state.workspaces.find((w) => w.id === id) ?? null;
    },
  };

  const handlers: HttpHandler[] = [
    ...createCoreHandlers(ctx),
    ...createTreeHandlers(ctx),
    ...createFilesHandlers(ctx),
    ...createKnowledgeHandlers(ctx),
    ...createCollectionHandlers(ctx),
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
