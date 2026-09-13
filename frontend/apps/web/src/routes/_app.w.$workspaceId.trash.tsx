import { createFileRoute } from '@tanstack/react-router';
import { trashQuery } from '../lib/queries';
import { TrashView } from '../components/shell/TrashView';

export const Route = createFileRoute('/_app/w/$workspaceId/trash')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(trashQuery(params.workspaceId)),
  component: TrashPage,
});

function TrashPage() {
  const { workspaceId } = Route.useParams();
  return <TrashView workspaceId={workspaceId} />;
}
