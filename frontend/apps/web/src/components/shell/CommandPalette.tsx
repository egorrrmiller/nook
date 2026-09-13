import { useNavigate, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { FileTextIcon, PanelLeftIcon, PlusIcon, SunMoonIcon, PuzzleIcon } from 'lucide-react';
import type { Node } from '@nook/api-client';
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
import { useUiStore } from '../../stores/ui';
import { toast } from '../../stores/toast';
import { fetchAllNodes, useCreateNode } from '../../lib/queries';
import { modKey, nodeTitle } from '../../lib/utils';

export function CommandPalette({ workspaceId }: { workspaceId: string }) {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const cycleTheme = useUiStore((s) => s.cycleTheme);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const params = useParams({ strict: false }) as { nodeId?: string };
  const create = useCreateNode(workspaceId);
  const pluginCommands = usePluginCommands();
  const [pages, setPages] = useState<Node[] | null>(null);
  const [query, setQuery] = useState('');

  // Client-side page index until server search lands in wave 1.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPages(null);
    fetchAllNodes(qc, workspaceId)
      .then((n) => !cancelled && setPages(n))
      .catch(() => !cancelled && setPages([]));
    return () => {
      cancelled = true;
    };
  }, [open, qc, workspaceId]);

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

  const visiblePlugins = pluginCommands.filter((c) => (c.isAvailable ? c.isAvailable(ctx) : true));

  return (
    <CommandPaletteShell open={open} onOpenChange={setOpen} label="Search and commands">
      <CommandInput
        placeholder="Search pages or type a command…"
        value={query}
        onValueChange={setQuery}
        data-testid="palette-input"
      />
      <CommandList>
        <CommandEmpty>{pages === null ? 'Loading…' : 'No results.'}</CommandEmpty>
        <CommandGroup heading="Pages">
          {(pages ?? []).map((p) => (
            <CommandItem
              key={p.id}
              value={`${nodeTitle(p.title)} ${p.id}`}
              keywords={[p.title]}
              onSelect={() => {
                setOpen(false);
                void navigate({
                  to: '/w/$workspaceId/p/$nodeId',
                  params: { workspaceId, nodeId: p.id },
                });
              }}
            >
              {p.icon?.type === 'emoji' ? (
                <span className="w-4 text-center">{p.icon.value}</span>
              ) : (
                <FileTextIcon />
              )}
              <span className="truncate">{nodeTitle(p.title)}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="create new page"
            onSelect={async () => {
              setOpen(false);
              const node = await create.mutateAsync({ kind: 'page', title: '' });
              void navigate({
                to: '/w/$workspaceId/p/$nodeId',
                params: { workspaceId, nodeId: node.id },
              });
            }}
          >
            <PlusIcon /> New page
          </CommandItem>
          <CommandItem
            value="toggle theme"
            onSelect={() => {
              cycleTheme();
              toast(`Theme: ${useUiStore.getState().theme}`);
            }}
          >
            <SunMoonIcon /> Toggle theme
          </CommandItem>
          <CommandItem
            value="toggle sidebar"
            onSelect={() => {
              toggleSidebar();
              setOpen(false);
            }}
          >
            <PanelLeftIcon /> Toggle sidebar
            <CommandShortcut>{modKey()} \</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        {visiblePlugins.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Plugins">
              {visiblePlugins.map((c) => {
                const Icon = c.icon ?? PuzzleIcon;
                return (
                  <CommandItem
                    key={c.id}
                    value={`${c.title} ${c.id}`}
                    keywords={c.keywords}
                    onSelect={() => {
                      setOpen(false);
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
