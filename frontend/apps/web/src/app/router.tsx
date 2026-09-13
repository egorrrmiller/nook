import { createRouter, type RouterHistory } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { routeTree } from '../routeTree.gen';

export interface RouterContext {
  queryClient: QueryClient;
}

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultNotFoundComponent: () => (
      <div className="flex h-full items-center justify-center p-8 text-fg-muted">Not found</div>
    ),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
