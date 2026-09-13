import type { AuthResponse } from '@nook/api-client';
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { api, keys } from '../../lib/api';
import { useWorkspaceStore } from '../../stores/workspace';

export function meQueryOptions() {
  return queryOptions({
    queryKey: keys.me,
    queryFn: ({ signal }) => api.me(signal),
    staleTime: 5 * 60_000,
  });
}

export function useMe(): AuthResponse {
  return useSuspenseQuery(meQueryOptions()).data;
}

/** Picks the workspace to land in after login: the persisted one if still a member, else personal, else first. */
export function pickWorkspace(me: AuthResponse, preferred: string | null): string | null {
  if (preferred && me.workspaces.some((w) => w.id === preferred)) return preferred;
  return me.workspaces.find((w) => w.isPersonal)?.id ?? me.workspaces[0]?.id ?? null;
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSettled: () => {
      qc.clear();
      useWorkspaceStore.getState().setActive(null);
    },
  });
}
