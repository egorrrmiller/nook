import { createFileRoute, notFound } from '@tanstack/react-router';
import { CollectionViewScreen } from '../features/collections';
import { nodeQuery } from '../lib/queries';

export const Route = createFileRoute('/_app/w/$workspaceId/db/$nodeId')({
  loader: async ({ context, params }) => {
    const node = await context.queryClient.ensureQueryData(nodeQuery(params.workspaceId, params.nodeId));
    if (node.kind !== 'database') throw notFound();
    return node;
  },
  component: DatabaseRoute,
  errorComponent: ({ error }) => <div role="alert" className="mx-auto max-w-[var(--content-max)] p-12 text-sm text-danger">Could not open this database: {error instanceof Error ? error.message : String(error)}</div>,
});

function DatabaseRoute() {
  const { workspaceId, nodeId } = Route.useParams();
  return <CollectionViewScreen workspaceId={workspaceId} nodeId={nodeId} readOnly={Route.useLoaderData().effectiveRole === 'viewer'} />;
}

