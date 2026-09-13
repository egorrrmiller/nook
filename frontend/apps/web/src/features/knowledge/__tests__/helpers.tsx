import { render, type RenderResult } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { TooltipProvider } from '@nook/ui';
import type { ReactNode } from 'react';
import { createQueryClient } from '../../../app/query-client';
import { mockApi } from '../../../mocks/handlers';
import { useWorkspaceStore } from '../../../stores/workspace';

export function signIn() {
  const owner = mockApi.state.users[0]!;
  mockApi.state.sessionUserId = owner.id;
  const ws = mockApi.state.workspaces[0]!;
  useWorkspaceStore.getState().setActive(ws.id);
  return { owner, workspaceId: ws.id };
}

export function nodeByTitle(title: string) {
  const n = mockApi.state.nodes.find((x) => x.title === title);
  if (!n) throw new Error(`No mock node titled "${title}"`);
  return n;
}

export interface RenderWidgetResult extends RenderResult {
  location: () => { pathname: string; hash: string };
}

/**
 * Renders one knowledge component inside a minimal router (the components use `<Link>` /
 * `useNavigate` / `useParams`) plus a fresh QueryClient. `path` seeds the memory history so
 * `useParams({strict:false}).nodeId` resolves the way PageView would provide it.
 */
export function renderWidget(ui: ReactNode, { path = '/' }: { path?: string } = {}): RenderWidgetResult {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> });
  const pageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/w/$workspaceId/p/$nodeId', component: () => <>{ui}</> });
  const graphRoute = createRoute({ getParentRoute: () => rootRoute, path: '/w/$workspaceId/graph', component: () => <>{ui}</> });
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <>{ui}</> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, pageRoute, graphRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = createQueryClient();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <RouterProvider router={router as any} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return {
    ...utils,
    location: () => ({ pathname: router.state.location.pathname, hash: router.state.location.hash }),
  };
}
