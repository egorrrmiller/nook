import { createFileRoute } from '@tanstack/react-router';
import { nodeQuery } from '../lib/queries';
import { PageView } from '../components/page/PageView';

export const Route = createFileRoute('/_app/w/$workspaceId/p/$nodeId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(nodeQuery(params.workspaceId, params.nodeId)),
  component: NodePage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-[var(--content-max)] p-12 text-fg-muted">
      Could not open this page: {error instanceof Error ? error.message : String(error)}
    </div>
  ),
});

function NodePage() {
  const { workspaceId, nodeId } = Route.useParams();
  return <PageView key={nodeId} workspaceId={workspaceId} nodeId={nodeId} />;
}
