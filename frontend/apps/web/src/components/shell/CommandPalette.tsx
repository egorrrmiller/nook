import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ClockIcon,
  FileTextIcon,
  PanelLeftIcon,
  PlusIcon,
  PuzzleIcon,
  SearchIcon,
  SettingsIcon,
  SunMoonIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPalette as CommandPaletteShell,
  CommandSeparator,
  CommandShortcut,
} from '@nook/ui';
import { usePluginCommands, type PluginCommandContext } from '@nook/plugin-sdk';
import { TagChips } from '../../features/knowledge';
import { useDebouncedValue } from '../../lib/hooks';
import { useCreateNode, useQuickFind, useRecents } from '../../lib/queries';
import { modKey, nodeTitle } from '../../lib/utils';
import { toast } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { NodeIcon } from '../tree/NodeIcon';
import { BreadcrumbText } from '../tree/BreadcrumbText';

/** ⌘K / ⌘P: quick find (§7.4) over titles and aliases, recents, actions and plugin commands. */
export function CommandPalette({ workspaceId }: { workspaceId: string }) {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const cycleTheme = useUiStore((s) => s.cycleTheme);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { nodeId?: string };
  const create = useCreateNode(workspaceId);
  const pluginCommands = usePluginCommands();
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query, 150);
  const { data: hits, isFetching } = useQuickFind(workspaceId, q, open);
  const { data: recents } = useRecents(workspaceId, open && !q);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const ctx = useMemo<PluginCommandContext>(
    () => ({
      workspaceId,
      nodeId: params.nodeId ?? null,
      navigate: (to) => void navigate({ href: to }),
      toast,
      editor: null,
    }),
    [workspaceId, params.nodeId, navigate],
  );

  // Pages come ranked from the server, so cmdk's own filtering is off; actions and plugin
  // commands are matched locally against the raw query instead.
  const needle = query.trim().toLowerCase();
  const matches = (label: string, keywords: readonly string[] = []) =>
    !needle || [label, ...keywords].some((s) => s.toLowerCase().includes(needle));

  const close = () => setOpen(false);
  const openPage = (nodeId: string) => {
    close();
    void navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId } });
  };
  const visiblePlugins = pluginCommands
    .filter((c) => (c.isAvailable ? c.isAvailable(ctx) : true))
    .filter((c) => matches(c.title, c.keywords ?? []));

  interface PaletteAction {
    id: string;
    label: string;
    icon: typeof PlusIcon;
    shortcut?: string;
    keywords?: string[];
    testId?: string;
    /** Always offered, whatever the query (Notion keeps "Search everything" in reach). */
    always?: boolean;
    run: () => void;
  }

  const allActions: PaletteAction[] = [
    {
      id: 'action-new-page',
      label: 'New page',
      icon: PlusIcon,
      shortcut: `${modKey()}⇧N`,
      keywords: ['create', 'add'],
      run: async () => {
        close();
        const node = await create.mutateAsync({ kind: 'page', title: '' });
        void navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: node.id } });
      },
    },
    {
      id: 'action-search-everything',
      label: q ? `Search everything — “${q}”` : 'Search everything',
      icon: SearchIcon,
      shortcut: `${modKey()}⇧F`,
      keywords: ['full text', 'find'],
      testId: 'palette-search-everything',
      always: true,
      run: () => {
        close();
        setSearchOpen(true);
      },
    },
    {
      id: 'action-toggle-theme',
      label: 'Toggle theme',
      icon: SunMoonIcon,
      keywords: ['dark', 'light', 'appearance'],
      run: () => {
        cycleTheme();
        toast(`Theme: ${useUiStore.getState().theme}`);
      },
    },
    {
      id: 'action-toggle-sidebar',
      label: 'Toggle sidebar',
      icon: PanelLeftIcon,
      shortcut: `${modKey()}\\`,
      keywords: ['hide', 'show'],
      run: () => {
        toggleSidebar();
        close();
      },
    },
    {
      id: 'action-open-trash',
      label: 'Open trash',
      icon: Trash2Icon,
      keywords: ['deleted', 'restore'],
      run: () => {
        close();
        void navigate({ to: '/w/$workspaceId/trash', params: { workspaceId } });
      },
    },
    {
      id: 'action-settings',
      label: 'Settings…',
      icon: SettingsIcon,
      shortcut: `${modKey()},`,
      keywords: ['preferences', 'account', 'members', 'tokens'],
      run: () => {
        close();
        void navigate({ to: '/w/$workspaceId/settings/$section', params: { workspaceId, section: 'account' } });
      },
    },
    {
      id: 'action-shortcuts',
      label: 'Keyboard shortcuts',
      icon: FileTextIcon,
      keywords: ['keys', 'help'],
      run: () => {
        close();
        setShortcutsOpen(true);
      },
    },
  ];
  const actions = allActions.filter((a) => a.always || matches(a.label, a.keywords ?? []));

  return (
    <CommandPaletteShell open={open} onOpenChange={setOpen} label="Search and commands" shouldFilter={false}>
      <CommandInput
        placeholder="Search pages or type a command…"
        value={query}
        onValueChange={setQuery}
        data-testid="palette-input"
      />
      <CommandList>
        <CommandEmpty>{isFetching ? 'Searching…' : 'No results.'}</CommandEmpty>

        {!q && recents?.length ? (
          <CommandGroup heading="Recent">
            {recents.slice(0, 5).map((r) => (
              <CommandItem key={r.node.id} value={`recent-${r.node.id}`} onSelect={() => openPage(r.node.id)}>
                <NodeIcon icon={r.node.icon} kind={r.node.kind} size={18} />
                <span className="truncate">{nodeTitle(r.node.title)}</span>
                <ClockIcon className="ml-auto size-3.5 opacity-60" />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {hits?.length ? (
          <CommandGroup heading={q ? 'Pages' : 'Jump to'} data-testid="palette-pages">
            {hits.map((hit) => (
              <CommandItem
                key={hit.node.id}
                value={`page-${hit.node.id}`}
                onSelect={() => openPage(hit.node.id)}
                data-testid="palette-hit"
              >
                <NodeIcon icon={hit.node.icon} kind={hit.node.kind} size={18} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{nodeTitle(hit.node.title)}</span>
                  <BreadcrumbText crumbs={hit.breadcrumb} />
                </span>
                <TagChips workspaceId={workspaceId} nodeId={hit.node.id} compact />
                {hit.matchedAlias ? (
                  <span className="ml-auto shrink-0 rounded-sm bg-bg-active px-1.5 py-0.5 text-[11px] text-fg-secondary">
                    alias: {hit.matchedAlias}
                  </span>
                ) : null}
                {hit.node.archivedAt ? (
                  <span className="ml-auto shrink-0 text-[11px] text-fg-muted">archived</span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {actions.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              {actions.map((a) => (
                <CommandItem key={a.id} value={a.id} onSelect={a.run} data-testid={a.testId}>
                  <a.icon /> {a.label}
                  {a.shortcut ? <CommandShortcut>{a.shortcut}</CommandShortcut> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {visiblePlugins.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Plugins">
              {visiblePlugins.map((c) => {
                const Icon = c.icon ?? PuzzleIcon;
                return (
                  <CommandItem
                    key={c.id}
                    value={`plugin-${c.id}-${c.title}`}
                    keywords={c.keywords}
                    onSelect={() => {
                      close();
                      void c.run(ctx);
                    }}
                  >
                    <Icon className="size-4 text-fg-muted" />
                    <span className="truncate">{c.title}</span>
                    {c.shortcut ? <CommandShortcut>{c.shortcut}</CommandShortcut> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandPaletteShell>
  );
}
