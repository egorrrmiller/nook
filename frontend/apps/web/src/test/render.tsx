import { render, type RenderResult } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, type RouterHistory } from '@tanstack/react-router';
import { PluginProvider, type NookPlugin } from '@nook/plugin-sdk';
import { TooltipProvider } from '@nook/ui';
import { createQueryClient } from '../app/query-client';
import { createAppRouter } from '../app/router';
import { mockApi } from '../mocks/handlers';
import { useWorkspaceStore } from '../stores/workspace';

/** Signs the mock session in without going through the form. */
export function signInMock() {
  const owner = mockApi.state.users[0]!;
  mockApi.state.sessionUserId = owner.id;
  return owner;
}

export function firstWorkspaceId() {
  return mockApi.state.workspaces[0]!.id;
}

export interface RenderAppOptions {
  path?: string;
  plugins?: NookPlugin[];
}

/** Renders the real app router at `path` with a memory history and a fresh QueryClient. */
export type RenderedApp = RenderResult & {
  router: ReturnType<typeof createAppRouter>;
  queryClient: QueryClient;
  history: RouterHistory;
};

// Explicit return type: with `composite` on, tsc must be able to name the inferred type, and
// RenderResult's inferred shape drags in a non-portable pnpm path to pretty-format.
export async function renderApp({ path = '/', plugins = [] }: RenderAppOptions = {}): Promise<RenderedApp> {
  useWorkspaceStore.getState().setActive(null);
  const queryClient = createQueryClient();
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createAppRouter(queryClient, history);
  const utils: RenderResult = render(
    <QueryClientProvider client={queryClient}>
      <PluginProvider plugins={plugins}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </PluginProvider>
    </QueryClientProvider>,
  );
  await router.load();
  return { ...utils, router, queryClient, history };
}
