import { redirect } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { ApiError, type AuthResponse } from '@nook/api-client';
import { meQuery, queryKeys } from '../lib/queries';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/workspace';

/** Loads `/api/me` (cached) or redirects to /login. Used in `beforeLoad` of guarded routes. */
export async function requireAuth(
  queryClient: QueryClient,
  redirectTo?: string,
): Promise<AuthResponse> {
  try {
    return await queryClient.ensureQueryData(meQuery());
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      throw redirect({ to: '/login', search: redirectTo ? { redirect: redirectTo } : {} });
    }
    throw err;
  }
}

/** Picks the persisted active workspace when the user still has access to it, else the first one. */
export function pickWorkspace(me: AuthResponse): string | null {
  const persisted = useWorkspaceStore.getState().activeWorkspaceId;
  const found = me.workspaces.find((w) => w.id === persisted) ?? me.workspaces[0];
  return found?.id ?? null;
}

export async function signOut(queryClient: QueryClient) {
  try {
    await api.auth.logout();
  } finally {
    queryClient.removeQueries({ queryKey: queryKeys.me });
    queryClient.clear();
  }
}
