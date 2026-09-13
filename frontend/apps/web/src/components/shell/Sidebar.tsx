import { Link, useNavigate } from '@tanstack/react-router';
import {
  ChevronRightIcon,
  ChevronsLeftIcon,
  HomeIcon,
  LayoutTemplateIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  SquarePenIcon,
  Trash2Icon,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { IconButton, Kbd, Switch, Tooltip, cn } from '@nook/ui';
import { usePluginSidebarPanels } from '@nook/plugin-sdk';
import { useUiStore } from '../../stores/ui';
import { useCreateNode, useMe } from '../../lib/queries';
import { modKey } from '../../lib/utils';
import { toast } from '../../stores/toast';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { Tree } from '../tree/Tree';
import { FavoritesList } from './FavoritesList';

interface NavItemProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  href?: string;
  trailing?: ReactNode;
  testId?: string;
  exact?: boolean;
  /**
   * Route owned by another slice and not present in this worktree's generated route tree
   * (e.g. the knowledge agent's `/graph`): linked by href instead of a typed `to`.
   */
  external?: boolean;
}

function NavItem({ icon: Icon, label, onClick, href, trailing, testId, exact = true, external }: NavItemProps) {
  const className =
    'flex h-7 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 text-left text-sm text-sidebar-foreground transition-colors duration-[var(--duration)] hover:bg-bg-hover hover:text-fg [&.active]:bg-bg-active [&.active]:font-medium [&.active]:text-fg';
  const inner = (
    <>
      <Icon className="size-[18px] shrink-0 text-fg-muted" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </>
  );
  if (href && external) {
    return (
      <a href={href} className={className} data-testid={testId}>
        {inner}
      </a>
    );
  }
  if (href) {
    return (
      <Link to={href} className={className} activeOptions={{ exact }} data-testid={testId}>
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
  id,
  title,
  children,
  action,
  testId,
}: {
  id: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  const collapsed = useUiStore((s) => !!s.collapsedSections[id]);
  const toggleSection = useUiStore((s) => s.toggleSection);
  return (
    <section className="mt-3" data-testid={testId} data-collapsed={collapsed}>
      <div className="group flex h-6 items-center gap-1 pr-1 pl-2">
        <button
          type="button"
          onClick={() => toggleSection(id)}
          aria-expanded={!collapsed}
          className="flex h-5 items-center gap-1 rounded-[var(--radius-sm)] px-1 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg-secondary"
        >
          <span>{title}</span>
          <ChevronRightIcon
            className={cn('size-3 opacity-0 transition-[transform,opacity] duration-[var(--duration)] group-hover:opacity-100', !collapsed && 'rotate-90')}
          />
        </button>
        <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity duration-[var(--duration)] group-hover:opacity-100 focus-within:opacity-100">
          {action}
        </span>
      </div>
      {!collapsed ? children : null}
    </section>
  );
}

export function Sidebar({ workspaceId }: { workspaceId: string }) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const showArchived = useUiStore((s) => s.showArchived);
  const setShowArchived = useUiStore((s) => s.setShowArchived);
  const navigate = useNavigate();
  const create = useCreateNode(workspaceId);
  const { data: me } = useMe();
  const panels = usePluginSidebarPanels();
  const workspace = me?.workspaces.find((w) => w.id === workspaceId);
  const canEdit = workspace?.role !== 'viewer';

  async function newPage(parentId: string | null = null) {
    const node = await create.mutateAsync({ parentId: parentId ?? undefined, kind: 'page', title: '' });
    await navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: node.id } });
  }

  return (
    <div className="flex h-full min-w-[var(--sidebar-min)] flex-col overflow-hidden">
      <div className="flex items-center gap-0.5 p-2 pb-1">
        <WorkspaceSwitcher workspaceId={workspaceId} />
        <Tooltip content={`Close sidebar (${modKey()}\\)`}>
          <IconButton label="Close sidebar" size="icon-sm" tooltip={false} onClick={toggleSidebar} className="text-fg-muted">
            <ChevronsLeftIcon />
          </IconButton>
        </Tooltip>
        {canEdit ? (
          <Tooltip content={`New page (${modKey()}⇧N)`}>
            <IconButton
              label="New page"
              size="icon-sm"
              tooltip={false}
              onClick={() => newPage()}
              data-testid="new-page"
              className="text-fg-muted"
            >
              <SquarePenIcon />
            </IconButton>
          </Tooltip>
        ) : null}
      </div>
      <nav className="flex-1 overflow-x-hidden overflow-y-auto px-2 pb-4" aria-label="Workspace navigation">
        <div className="flex flex-col gap-px">
          <NavItem
            icon={SearchIcon}
            label="Search"
            onClick={() => setPaletteOpen(true)}
            trailing={<Kbd className="h-4 min-w-4 border-0 bg-transparent px-0 text-[11px]">{modKey()}K</Kbd>}
            testId="nav-search"
          />
          <NavItem icon={HomeIcon} label="Home" href={`/w/${workspaceId}`} testId="nav-home" />
          <NavItem
            icon={ShareIcon}
            label="Graph"
            href={`/w/${workspaceId}/graph`}
            external
            testId="nav-graph"
          />
          <NavItem icon={SettingsIcon} label="Settings" href={`/w/${workspaceId}/settings/account`} exact={false} testId="nav-settings" />
        </div>

        <Section id="favorites" title="Favorites" testId="section-favorites">
          <FavoritesList workspaceId={workspaceId} />
        </Section>

        <Section
          id="private"
          title="Private"
          testId="section-private"
          action={
            <>
              <Tooltip content={showArchived ? 'Hide archived pages' : 'Show archived pages'}>
                <span className="flex h-5 items-center gap-1 px-1 text-[11px] text-fg-muted">
                  <Switch
                    aria-label="Show archived"
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                    className="h-[14px] w-[24px] p-[1px] [&_span]:size-[12px] [&_span]:data-checked:translate-x-[10px]"
                    data-testid="toggle-archived"
                  />
                </span>
              </Tooltip>
              {canEdit ? (
                <IconButton label="Add a page" size="icon-sm" className="size-5 text-fg-muted" onClick={() => newPage()}>
                  <PlusIcon className="size-4" />
                </IconButton>
              ) : null}
            </>
          }
        >
          <Tree workspaceId={workspaceId} scope="private" />
        </Section>

        <Section id="shared" title="Shared with me" testId="section-shared">
          <Tree workspaceId={workspaceId} scope="shared" emptyText="Nothing shared yet." />
        </Section>

        {panels.map((panel) => {
          const Panel = panel.component;
          return (
            <Section key={`${panel.pluginId}:${panel.id}`} id={`plugin:${panel.pluginId}:${panel.id}`} title={panel.title}>
              <Panel workspaceId={workspaceId} />
            </Section>
          );
        })}

        <div className="mt-4 flex flex-col gap-px">
          <NavItem icon={LayoutTemplateIcon} label="Templates" onClick={() => toast('Templates are coming in a later wave')} />
          <NavItem icon={Trash2Icon} label="Trash" href={`/w/${workspaceId}/trash`} testId="nav-trash" />
        </div>
      </nav>
    </div>
  );
}
