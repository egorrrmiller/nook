import { Link, useNavigate } from '@tanstack/react-router';
import {
  ChevronsLeftIcon,
  HomeIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
  Trash2Icon,
  UsersIcon,
  SquarePenIcon,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { IconButton, Kbd, Tooltip, cn } from '@nook/ui';
import { useUiStore } from '../../stores/ui';
import { useCreateNode } from '../../lib/queries';
import { modKey } from '../../lib/utils';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { Tree } from '../tree/Tree';

function NavItem({
  icon: Icon,
  label,
  onClick,
  to,
  params,
  trailing,
  testId,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  to?: '/w/$workspaceId';
  params?: { workspaceId: string };
  trailing?: ReactNode;
  testId?: string;
}) {
  const className =
    'flex h-7 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 text-sm text-fg-secondary hover:bg-bg-hover hover:text-fg [&.active]:bg-bg-active [&.active]:text-fg';
  const inner = (
    <>
      <Icon className="size-4 shrink-0 text-fg-muted" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </>
  );
  if (to && params) {
    return (
      <Link
        to={to}
        params={params}
        className={className}
        activeOptions={{ exact: true }}
        data-testid={testId}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} data-testid={testId}>
      {inner}
    </button>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="group flex h-6 items-center px-2">
        <span className="text-xs font-medium text-fg-muted">{title}</span>
        <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
          {action}
        </span>
      </div>
      {children}
    </div>
  );
}

export function Sidebar({ workspaceId }: { workspaceId: string }) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const navigate = useNavigate();
  const create = useCreateNode(workspaceId);

  async function newPage(parentId: string | null = null) {
    const node = await create.mutateAsync({ parentId: parentId ?? undefined, kind: 'page', title: '' });
    await navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: node.id } });
  }

  return (
    <div className="flex h-full min-w-[var(--sidebar-min)] flex-col overflow-hidden">
      <div className="flex items-center gap-1 p-2 pb-1">
        <WorkspaceSwitcher workspaceId={workspaceId} />
        <Tooltip content={`Close sidebar (${modKey()}\\)`}>
          <IconButton label="Close sidebar" size="icon-sm" onClick={toggleSidebar}>
            <ChevronsLeftIcon />
          </IconButton>
        </Tooltip>
        <Tooltip content="New page">
          <IconButton label="New page" size="icon-sm" onClick={() => newPage()} data-testid="new-page">
            <SquarePenIcon />
          </IconButton>
        </Tooltip>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <div className="flex flex-col gap-px">
          <NavItem
            icon={SearchIcon}
            label="Search"
            onClick={() => setPaletteOpen(true)}
            trailing={<Kbd>{modKey()} K</Kbd>}
            testId="nav-search"
          />
          <NavItem
            icon={HomeIcon}
            label="Home"
            to="/w/$workspaceId"
            params={{ workspaceId }}
            testId="nav-home"
          />
          <NavItem icon={SettingsIcon} label="Settings" onClick={() => {}} />
        </div>

        <Section title="Favorites">
          <p className="px-2 py-1 text-xs text-fg-disabled">Star pages to see them here.</p>
        </Section>

        <Section
          title="Private"
          action={
            <IconButton label="Add a page" size="icon-sm" onClick={() => newPage()}>
              <PlusIcon />
            </IconButton>
          }
        >
          <Tree workspaceId={workspaceId} parentId={null} depth={0} />
        </Section>

        <Section title="Shared with me">
          <p className="px-2 py-1 text-xs text-fg-disabled">
            <UsersIcon className="mr-1 inline size-3" />
            Nothing shared yet.
          </p>
        </Section>

        <div className={cn('mt-4 flex flex-col gap-px')}>
          <NavItem icon={StarIcon} label="Templates" onClick={() => {}} />
          <NavItem icon={Trash2Icon} label="Trash" onClick={() => {}} />
        </div>
      </nav>
    </div>
  );
}
