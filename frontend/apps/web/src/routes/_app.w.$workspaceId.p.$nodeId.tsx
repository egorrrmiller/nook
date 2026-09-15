import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { ancestorsQuery, nodeQuery } from '../lib/queries';
import { PageView } from '../components/page/PageView';
import { CollectionViewScreen } from '../features/collections';

export const Route = createFileRoute('/_app/w/$workspaceId/p/$nodeId')({
  loader: async ({ context, params }) => {
    const node = await context.queryClient.ensureQueryData(nodeQuery(params.workspaceId, params.nodeId));
    void context.queryClient.ensureQueryData(ancestorsQuery(params.workspaceId, params.nodeId));
    return node;
  },
  component: NodePage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-[var(--content-max)] p-12 text-fg-muted">
      Could not open this page: {error instanceof Error ? error.message : String(error)}
    </div>
  ),
});

function NodePage() {
  const { workspaceId, nodeId } = Route.useParams();
  const node = Route.useLoaderData();
  useRecordVisit(workspaceId, nodeId);
  if (node.kind === 'database') return <CollectionViewScreen workspaceId={workspaceId} nodeId={nodeId} readOnly={node.effectiveRole === 'viewer'} />;
  return <PageView key={nodeId} workspaceId={workspaceId} nodeId={nodeId} />;
}

/** §7.3: records the visit shortly after the page settles, so quick navigation does not spam it. */
function useRecordVisit(workspaceId: string, nodeId: string) {
  useEffect(() => {
    const t = setTimeout(() => {
      void api.recents.record(nodeId).catch(() => undefined);
    }, 800);
    return () => clearTimeout(t);
  }, [workspaceId, nodeId]);
}
