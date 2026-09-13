import { createFileRoute, redirect } from '@tanstack/react-router';
import { pickWorkspace, requireAuth } from '../app/auth';

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const me = await requireAuth(context.queryClient);
    const workspaceId = pickWorkspace(me);
    if (workspaceId) throw redirect({ to: '/w/$workspaceId', params: { workspaceId } });
  },
  component: () => (
    <div className="flex h-dvh items-center justify-center text-fg-muted">
      You are not a member of any workspace yet.
    </div>
  ),
});
