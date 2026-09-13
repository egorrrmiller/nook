import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { DownloadIcon, Loader2Icon, NetworkIcon, SearchIcon, UploadIcon } from 'lucide-react';
import { Skeleton, cn } from '@nook/ui';
import { useAncestors } from '../../../lib/ancestors';
import { useNodes } from '../../../lib/queries';
import { nodeTitle } from '../../../lib/utils';
import { useUiStore } from '../../../stores/ui';
import { ExportDialog } from '../export/ExportDialog';
import { ImportDialog } from '../import/ImportDialog';
import { SearchDialog } from '../search/SearchDialog';
import { useGraph, useTags } from '../api/queries';
import { matchNodes, toSimGraph, type SimNode } from '../lib/graph-transform';
import { EmptyState } from '../ui/EmptyState';
import { BrokenLinksList } from './BrokenLinksList';
import { GraphCanvas } from './GraphCanvas';

const DEPTHS = [1, 2, 3] as const;

/** `/w/$workspaceId/graph` — force-directed link graph + the broken-links side list (§9.6, §9.1). */
export function GraphView({ workspaceId, focusNodeId }: { workspaceId: string; focusNodeId?: string | null }) {
  const navigate = useNavigate();
  const [scope, setScope] = useState<'workspace' | 'page'>(focusNodeId ? 'page' : 'workspace');
  const [depth, setDepth] = useState<number>(2);
  const [showParentEdges, setShowParentEdges] = useState(true);
  const [showTags, setShowTags] = useState(false);
  const [query, setQuery] = useState('');
  // Knowledge actions live here until the shell mounts them globally (see the report).
  const searchOpen = useUiStore((s) => s.searchOpen);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { data: roots } = useNodes(workspaceId, null);

  const rootId = scope === 'page' ? focusNodeId ?? undefined : undefined;
  const { data, isPending, isError, isFetching } = useGraph(workspaceId, { rootId, depth, includeTags: showTags });
  const { data: tags } = useTags(workspaceId, showTags);
  const { data: chain } = useAncestors(workspaceId, focusNodeId ?? null);
  const focusTitle = chain?.length ? nodeTitle(chain[chain.length - 1]!.title) : null;

  const graph = useMemo(() => toSimGraph(data, { showParentEdges, showTags }, tags ?? [], rootId), [data, showParentEdges, showTags, tags, rootId]);
  const highlighted = useMemo(() => matchNodes(graph.nodes, query), [graph.nodes, query]);

  const open = (n: SimNode) => void navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: n.id } });

  const chipClass = 'inline-flex h-6 items-center gap-1 rounded-full border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';
  const chipOn = 'border-primary/40 bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-foreground';

  return (
    <div data-testid="graph-view" className="flex h-full min-h-0 w-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
          <h1 className="mr-1 flex items-center gap-1.5 text-sm font-semibold">
            <NetworkIcon className="size-4 text-muted-foreground" /> Graph
          </h1>
          <button type="button" aria-pressed={scope === 'workspace'} onClick={() => setScope('workspace')} className={cn(chipClass, scope === 'workspace' && chipOn)}>
            Whole workspace
          </button>
          {focusNodeId ? (
            <button type="button" aria-pressed={scope === 'page'} onClick={() => setScope('page')} className={cn(chipClass, scope === 'page' && chipOn)} data-testid="graph-scope-page">
              Around {focusTitle ?? 'current page'}
            </button>
          ) : null}
          {scope === 'page' ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              Depth
              {DEPTHS.map((d) => (
                <button key={d} type="button" aria-pressed={depth === d} onClick={() => setDepth(d)} className={cn('size-6 rounded-full border border-border tabular-nums hover:bg-accent', depth === d && chipOn)}>
                  {d}
                </button>
              ))}
            </span>
          ) : null}
          <button type="button" aria-pressed={showParentEdges} onClick={() => setShowParentEdges((v) => !v)} className={cn(chipClass, showParentEdges && chipOn)} data-testid="graph-toggle-parents">
            Parent edges
          </button>
          <button type="button" aria-pressed={showTags} onClick={() => setShowTags((v) => !v)} className={cn(chipClass, showTags && chipOn)} data-testid="graph-toggle-tags">
            Tags
          </button>
          <label className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border px-2 focus-within:border-primary">
            <SearchIcon className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Highlight…"
              aria-label="Highlight nodes"
              data-testid="graph-search"
              className="h-full w-32 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
            {highlighted.size ? <span className="text-[11px] text-muted-foreground tabular-nums">{highlighted.size}</span> : null}
          </label>
          {isFetching ? <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" /> : null}
          <span className="mx-1 h-4 w-px bg-border" />
          <button type="button" onClick={() => setSearchOpen(true)} className={chipClass} data-testid="open-search">
            <SearchIcon /> Search
          </button>
          <button type="button" onClick={() => setExportOpen(true)} className={chipClass} data-testid="open-export">
            <DownloadIcon /> Export
          </button>
          <button type="button" onClick={() => setImportOpen(true)} className={chipClass} data-testid="open-import">
            <UploadIcon /> Import
          </button>
        </header>
        <div className="relative min-h-0 flex-1">
          {isPending ? (
            <div className="flex h-full items-center justify-center">
              <Skeleton className="size-64 rounded-full" />
            </div>
          ) : isError ? (
            <EmptyState icon={<NetworkIcon />} title="Could not load the graph" hint="The knowledge API did not answer." />
          ) : graph.nodes.length === 0 ? (
            <EmptyState icon={<NetworkIcon />} title="Nothing to show yet" hint="Link pages with @ or [[ and they will appear here." />
          ) : (
            <GraphCanvas nodes={graph.nodes} links={graph.links} highlighted={highlighted} onOpen={open} rootId={rootId ?? null} />
          )}
          {data?.truncated ? (
            <p className="absolute top-2 left-2 rounded-sm bg-muted px-2 py-1 text-[11px] text-muted-foreground">Showing the first 2 000 nodes.</p>
          ) : null}
          <p className="absolute bottom-2 left-2 text-[11px] text-muted-foreground">
            {graph.nodes.length} nodes · {graph.links.length} links · scroll to zoom, drag to pan, click to open
          </p>
        </div>
      </div>
      <aside className="hidden w-72 shrink-0 flex-col border-l border-border md:flex">
        <BrokenLinksList workspaceId={workspaceId} />
      </aside>
      <SearchDialog workspaceId={workspaceId} open={searchOpen} onOpenChange={setSearchOpen} />
      <ExportDialog
        workspaceId={workspaceId}
        nodeIds={focusNodeId ? [focusNodeId] : (roots ?? []).map((n) => n.id)}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
      <ImportDialog workspaceId={workspaceId} parentId={focusNodeId ?? null} open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
