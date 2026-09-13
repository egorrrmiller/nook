import { createFileRoute, notFound } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useWorkspaceStore } from '../stores/workspace';
import { AppShell } from '../components/shell/AppShell';

export const Route = createFileRoute('/_app/w/$workspaceId')({
  beforeLoad: ({ context, params }) => {
    const ws = context.me.workspaces.find((w) => w.id === params.workspaceId);
    if (!ws) throw notFound();
    // Set synchronously so loaders/queries below carry the right X-Workspace-Id.
    useWorkspaceStore.getState().setActive(ws.id);
    return { workspace: ws };
  },
  component: WorkspaceLayout,
  notFoundComponent: () => (
    <div className="flex h-dvh items-center justify-center text-fg-muted">
      Workspace not found or you no longer have access.
    </div>
  ),
});

function WorkspaceLayout() {
  const { workspaceId } = Route.useParams();
  const setActive = useWorkspaceStore((s) => s.setActive);
  useEffect(() => setActive(workspaceId), [workspaceId, setActive]);
  return <AppShell workspaceId={workspaceId} />;
}
