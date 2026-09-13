import { Link, useNavigate } from '@tanstack/react-router';
import { FileTextIcon, PlusIcon } from 'lucide-react';
import { Button, Skeleton } from '@nook/ui';
import { useCreateNode, useMe, useNodes } from '../../lib/queries';
import { nodeTitle } from '../../lib/utils';

export function HomeScreen({ workspaceId }: { workspaceId: string }) {
  const { data: me } = useMe();
  const { data: roots, isPending } = useNodes(workspaceId, null);
  const create = useCreateNode(workspaceId);
  const navigate = useNavigate();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="mx-auto w-full max-w-[var(--content-max)] px-6 py-16">
      <h1 className="text-3xl font-bold" data-testid="home-greeting">
        {greeting}, {me?.user.displayName ?? 'there'}
      </h1>
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-fg-muted">Pages</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const n = await create.mutateAsync({ kind: 'page', title: '' });
              await navigate({
                to: '/w/$workspaceId/p/$nodeId',
                params: { workspaceId, nodeId: n.id },
              });
            }}
          >
            <PlusIcon className="size-4" /> New page
          </Button>
        </div>
        {isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : roots?.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {roots.map((n) => (
              <Link
                key={n.id}
                to="/w/$workspaceId/p/$nodeId"
                params={{ workspaceId, nodeId: n.id }}
                className="flex h-24 flex-col justify-end rounded-[var(--radius)] border border-border bg-bg p-3 shadow-[var(--shadow-sm)] transition-colors hover:bg-bg-hover"
              >
                <span className="text-xl">
                  {n.icon?.type === 'emoji' ? (
                    n.icon.value
                  ) : (
                    <FileTextIcon className="size-5 text-fg-muted" />
                  )}
                </span>
                <span className="mt-1 truncate text-sm font-medium">{nodeTitle(n.title)}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-muted">No pages yet. Create your first one.</p>
        )}
      </section>
    </div>
  );
}
