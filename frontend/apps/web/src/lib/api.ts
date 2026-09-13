import { configureApi } from '@nook/api-client';
import { useWorkspaceStore } from '../stores/workspace';

/** Wire the shared client to the active-workspace store once, at import time. */
configureApi({
  baseUrl: '',
  getWorkspaceId: () => useWorkspaceStore.getState().activeWorkspaceId,
});

export { api } from '@nook/api-client';

/** Dev-only: serve the API from MSW handlers instead of a real backend (`VITE_MOCK=1`). */
export const IS_MOCK = import.meta.env.VITE_MOCK === '1';

export const keys = {
  me: ['me'] as const,
  nodes: (workspaceId: string, parentId?: string | null) => ['nodes', workspaceId, parentId ?? 'root'] as const,
  node: (id: string) => ['node', id] as const,
  ancestors: (id: string) => ['ancestors', id] as const,
  members: (workspaceId: string) => ['members', workspaceId] as const,
};
