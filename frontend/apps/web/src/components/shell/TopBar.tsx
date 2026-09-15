import { useLocation, useNavigate, useParams } from '@tanstack/react-router';
import {
  ClockIcon,
  DownloadIcon,
  HistoryIcon,
  InfoIcon,
  Link2Icon,
  MoreHorizontalIcon,
  PanelRightIcon,
  StarIcon,
  TextIcon,
} from 'lucide-react';
import { useState } from 'react';
import type { PageSettings } from '@nook/api-client';
import {
  Avatar,
  IconButton,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  ToggleButton,
  Tooltip,
  cn,
} from '@nook/ui';
import { ExportDialog } from '../../features/knowledge';
import { useFavorites, useNode, useSetFavorite, useUpdateNode } from '../../lib/queries';
import { relativeTime } from '../../lib/utils';
import { usePresenceStore } from '../../stores/presence';
import { useUiStore, type InspectorTab } from '../../stores/ui';
import { Breadcrumbs } from './Breadcrumbs';
import { NodeMenuItems, useNodeActions } from '../tree/NodeMenu';

const FONTS: { value: PageSettings['font']; label: string; className: string }[] = [
  { value: 'default', label: 'Default', className: 'font-sans' },
  { value: 'serif', label: 'Serif', className: 'font-serif' },
  { value: 'mono', label: 'Mono', className: 'font-mono' },
];

const INSPECTORS: { value: InspectorTab; label: string; icon: typeof InfoIcon }[] = [
  { value: 'backlinks', label: 'Backlinks', icon: Link2Icon },
  { value: 'history', label: 'History', icon: HistoryIcon },
  { value: 'info', label: 'Info', icon: InfoIcon },
];

export function TopBar({ workspaceId }: { workspaceId: string }) {
  const peekNodeId = useUiStore((s) => s.peekNodeId);
  const setPeek = useUiStore((s) => s.setPeek);
  const inspector = useUiStore((s) => s.inspector);
  const toggleInspector = useUiStore((s) => s.toggleInspector);
  const params = useParams({ strict: false }) as { nodeId?: string; section?: string };
  const nodeId = params.nodeId ?? null;
  const navigate = useNavigate();
  const pathname = useLocation({ select: (l) => l.pathname });
  const { data: node } = useNode(workspaceId, nodeId ?? '', !!nodeId);
  const { data: favorites } = useFavorites(workspaceId);
  const setFavorite = useSetFavorite(workspaceId);
  const update = useUpdateNode(workspaceId);
  const actions = useNodeActions(workspaceId);
  const presence = usePresenceStore((s) => (nodeId ? s.byNode[nodeId] : undefined));
  const [exportOpen, setExportOpen] = useState(false);
  const isFavorite = !!favorites?.some((f) => f.nodeId === nodeId);
  const settings: PageSettings = {
    font: 'default',
    smallText: false,
    fullWidth: false,
    locked: false,
    ...node?.pageSettings,
  };
  const readOnly = node?.effectiveRole === 'viewer';

  const patch = (pageSettings: Partial<PageSettings>) => {
    if (!node) return;
    update.mutate({ id: node.id, pageSettings });
  };

  return (
    <header
      data-testid="topbar"
      className="flex h-[var(--topbar-height)] shrink-0 items-center gap-1 px-2 text-sm"
    >
      <div className="flex min-w-0 flex-1 items-center px-1">
        {nodeId ? (
          <Breadcrumbs workspaceId={workspaceId} nodeId={nodeId} />
        ) : (
          <span className="px-1.5 font-medium text-fg" data-testid="topbar-label">
            {pathname.includes('/trash')
              ? 'Trash'
              : pathname.includes('/settings')
                ? 'Settings'
                : pathname.includes('/graph')
                  ? 'Graph'
                  : 'Home'}
          </span>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {node?.updatedAt ? (
          <span className="mr-1 hidden text-xs text-fg-muted md:inline">Edited {relativeTime(node.updatedAt)}</span>
        ) : null}

        {presence?.length ? (
          <div className="mr-1 flex -space-x-1.5" aria-label="People on this page">
            {presence.slice(0, 3).map((u) => (
              <Tooltip key={u.id} content={u.name}>
                <Avatar name={u.name} color={u.color} size="sm" className="ring-2 ring-bg" />
              </Tooltip>
            ))}
            {presence.length > 3 ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-bg-active text-[10px] text-fg-secondary ring-2 ring-bg">
                +{presence.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}

        {nodeId && node ? (
          <>
            {INSPECTORS.map(({ value, label, icon: Icon }) => (
              <Tooltip key={value} content={label}>
                <IconButton
                  label={label}
                  tooltip={false}
                  onClick={() => toggleInspector(value)}
                  aria-pressed={inspector === value}
                  data-testid={`inspector-${value}`}
                  className={cn(inspector === value && 'bg-bg-active text-fg')}
                >
                  <Icon />
                </IconButton>
              </Tooltip>
            ))}
            <Tooltip content={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}>
              <IconButton
                label={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                tooltip={false}
                data-testid="topbar-favorite"
                aria-pressed={isFavorite}
                onClick={() => setFavorite.mutate({ node, favorite: !isFavorite })}
              >
                <StarIcon className={cn(isFavorite && 'fill-[#f5c518] text-[#f5c518]')} />
              </IconButton>
            </Tooltip>
            <Tooltip content={peekNodeId ? 'Close side peek' : 'Open in side peek'}>
              <IconButton label="Toggle side peek" tooltip={false} onClick={() => setPeek(peekNodeId ? null : nodeId)}>
                <PanelRightIcon />
              </IconButton>
            </Tooltip>

            <Menu>
              <MenuTrigger
                aria-label="Page options"
                data-testid="page-menu"
                className="flex size-7 items-center justify-center rounded-[var(--radius-md)] text-fg-secondary hover:bg-bg-hover"
              >
                <MoreHorizontalIcon className="size-4" />
              </MenuTrigger>
              <MenuContent className="w-64" align="end">
                <MenuGroup>
                  <MenuLabel>Style</MenuLabel>
                  <div className="flex gap-1 px-2 pb-1.5">
                    {FONTS.map((f) => (
                      <ToggleButton
                        key={f.value}
                        pressed={settings.font === f.value}
                        disabled={readOnly}
                        onClick={() => patch({ font: f.value })}
                        data-testid={`font-${f.value}`}
                        className={cn(
                          'h-12 flex-1 flex-col gap-0.5 rounded-[var(--radius-sm)] border-border bg-transparent text-[11px] text-fg-secondary transition-colors hover:bg-bg-hover aria-pressed:bg-transparent disabled:opacity-50',
                          f.className,
                          settings.font === f.value && 'border-brand text-fg',
                        )}
                      >
                        <span className="text-base leading-none">Ag</span>
                        {f.label}
                      </ToggleButton>
                    ))}
                  </div>
                  <MenuCheckboxItem
                    checked={settings.smallText}
                    onCheckedChange={(v) => patch({ smallText: v })}
                    disabled={readOnly}
                    data-testid="toggle-small-text"
                  >
                    <TextIcon /> Small text
                  </MenuCheckboxItem>
                  <MenuCheckboxItem
                    checked={settings.fullWidth}
                    onCheckedChange={(v) => patch({ fullWidth: v })}
                    disabled={readOnly}
                    data-testid="toggle-full-width"
                  >
                    Full width
                  </MenuCheckboxItem>
                  <MenuCheckboxItem
                    checked={settings.locked}
                    onCheckedChange={(v) => patch({ locked: v })}
                    disabled={readOnly}
                    data-testid="toggle-lock"
                  >
                    Lock page
                  </MenuCheckboxItem>
                </MenuGroup>
                <MenuSeparator />
                <NodeMenuItems node={node} actions={actions} hide={{ rename: true }} />
                <MenuSeparator />
                <MenuSub>
                  <MenuSubTrigger>
                    <DownloadIcon /> Export
                  </MenuSubTrigger>
                  <MenuSubContent className="w-48">
                    <MenuItem onClick={() => setExportOpen(true)}>Export this page…</MenuItem>
                    <MenuItem onClick={() => void navigate({ to: '/w/$workspaceId/settings/$section', params: { workspaceId, section: 'import-export' } })}>
                      Import / export…
                    </MenuItem>
                  </MenuSubContent>
                </MenuSub>
                <MenuItem onClick={() => void navigate({ to: '/w/$workspaceId/trash', params: { workspaceId } })}>
                  <ClockIcon /> Open trash
                </MenuItem>
              </MenuContent>
            </Menu>
            <ExportDialog workspaceId={workspaceId} nodeIds={[node.id]} open={exportOpen} onOpenChange={setExportOpen} />
          </>
        ) : (
          <Tooltip content="Keyboard shortcuts">
            <IconButton label="Keyboard shortcuts" onClick={() => useUiStore.getState().setShortcutsOpen(true)}>
              <InfoIcon />
            </IconButton>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
