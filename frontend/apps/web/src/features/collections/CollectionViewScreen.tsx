import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AlertCircleIcon, DatabaseIcon, RefreshCwIcon } from 'lucide-react';
import { Button, Skeleton } from '@nook/ui';
import { useNode } from '../../lib/queries';
import { useUpdateCollectionRow, useUpdateCollectionView, useCollection } from './queries';
import type { CollectionRow, CollectionViewConfig, CollectionViewKind } from './model';
import { cloneViewConfig, DEFAULT_COLLECTION_VIEW_CONFIG } from './model';
import { applyViewConfig } from './views/view-utils';
import { BoardView } from './views/BoardView';
import { CalendarView } from './views/CalendarView';
import { GalleryView } from './views/GalleryView';
import { ListView } from './views/ListView';
import { TableView } from './views/TableView';
import { CollectionViewToolbar } from './CollectionViewToolbar';
import { CollectionRowPeek } from './CollectionRowPeek';

export function CollectionViewScreen({ workspaceId, nodeId, readOnly = false, rowOpenMode = 'side', onOpenRow }: { workspaceId: string; nodeId: string; readOnly?: boolean; rowOpenMode?: 'side' | 'center' | 'page'; onOpenRow?: (row: CollectionRow, mode: 'side' | 'center' | 'page') => void }) {
  const { data: node } = useNode(workspaceId, nodeId);
  const collectionQuery = useCollection(workspaceId, nodeId, Boolean(node));
  const updateRow = useUpdateCollectionRow(workspaceId, nodeId);
  const updateView = useUpdateCollectionView(workspaceId, nodeId);
  const navigate = useNavigate();
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [config, setConfig] = useState<CollectionViewConfig>(DEFAULT_COLLECTION_VIEW_CONFIG);
  const [peek, setPeek] = useState<{ row: CollectionRow; mode: 'side' | 'center' } | null>(null);
  const collection = collectionQuery.data;
  const refetchCollection = collectionQuery.refetch;
  const activeView = collection?.views.find((view) => view.id === activeViewId) ?? collection?.views[0];

  useEffect(() => {
    if (!collection) return;
    const nextId = activeViewId && collection.views.some((view) => view.id === activeViewId) ? activeViewId : collection.defaultViewId ?? collection.views[0]?.id ?? null;
    if (nextId !== activeViewId) setActiveViewId(nextId);
    const nextView = collection.views.find((view) => view.id === nextId);
    if (nextView) setConfig(cloneViewConfig(nextView.config));
    // A view switch should reset local config to the server version; edits are optimistically reflected by the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection?.id, collection?.views, collection?.defaultViewId]);

  const filteredRows = useMemo(() => (collection ? applyViewConfig(collection.rows, config) : []), [collection, config]);

  const commitConfig = useCallback((next: CollectionViewConfig) => {
    setConfig(next);
    if (!readOnly && activeView) updateView.mutate({ viewId: activeView.id, config: next });
  }, [activeView, readOnly, updateView]);

  const openFullPage = useCallback((row: CollectionRow) => {
    void navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: row.nodeId ?? row.id } });
  }, [navigate, workspaceId]);

  const openRow = useCallback((row: CollectionRow) => {
    onOpenRow?.(row, rowOpenMode);
    if (onOpenRow) return;
    if (rowOpenMode === 'page') return openFullPage(row);
    setPeek({ row, mode: rowOpenMode });
  }, [onOpenRow, openFullPage, rowOpenMode]);

  if (collectionQuery.isPending || !node) return <CollectionLoading />;
  if (collectionQuery.isError) return <CollectionError onRetry={() => void refetchCollection()} />;
  if (!collection) return <CollectionError onRetry={() => void refetchCollection()} />;
  if (!activeView) return <CollectionEmptyState title={node.title || collection.name} message="This database has no views yet. The backend view schema is required before rows can be displayed." />;
  const viewConfig = config.visiblePropertyIds.length || config.filters.children.length || config.sorts.length || config.groupBy ? config : activeView.config;
  const viewProps = { properties: collection.properties, rows: filteredRows, config: viewConfig, onOpenRow: openRow };
  return (
    <div data-testid="collection-view-screen" className="mx-auto flex w-full max-w-[var(--content-max)] flex-col gap-5 px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand"><DatabaseIcon className="size-5" /></span><div className="min-w-0"><h1 className="truncate text-3xl font-semibold">{node.title || collection.name || 'Untitled database'}</h1><p className="mt-1 text-sm text-fg-muted">{collection.rows.length} {collection.rows.length === 1 ? 'row' : 'rows'} · {activeView.name}</p></div></div></header>
      <CollectionViewToolbar views={collection.views} activeViewId={activeView.id} properties={collection.properties} config={viewConfig} readOnly={readOnly || node.effectiveRole === 'viewer'} onViewChange={(id) => { setActiveViewId(id); const next = collection.views.find((view) => view.id === id); if (next) setConfig(cloneViewConfig(next.config)); }} onConfigChange={commitConfig} />
      {!collection.rows.length ? <CollectionEmptyState title="Nothing here yet" message="Add a page to this database to see it in the first table view." /> : renderView(activeView.kind, viewProps, readOnly || node.effectiveRole === 'viewer', (row, propertyId, value) => { if (!readOnly) updateRow.mutate({ rowId: row.id, propertyId, value }); })}
      {peek ? <CollectionRowPeek row={peek.row} properties={collection.properties} mode={peek.mode} onClose={() => setPeek(null)} onOpenFullPage={() => openFullPage(peek.row)} /> : null}
    </div>
  );
}

type CollectionViewProps = ComponentProps<typeof TableView>;

function renderView(kind: CollectionViewKind, props: Omit<CollectionViewProps, 'readOnly' | 'onChange'>, readOnly: boolean, onChange: CollectionViewProps['onChange']) {
  if (kind === 'board') return <BoardView {...props} />;
  if (kind === 'list') return <ListView {...props} />;
  if (kind === 'gallery') return <GalleryView {...props} />;
  if (kind === 'calendar') return <CalendarView {...props} />;
  return <TableView {...props} readOnly={readOnly} onChange={onChange} />;
}

function CollectionLoading() { return <div data-testid="collection-loading" className="mx-auto w-full max-w-[var(--content-max)] px-6 py-8"><Skeleton className="h-9 w-64" /><Skeleton className="mt-3 h-8 w-96" /><Skeleton className="mt-6 h-64 w-full" /></div>; }
function CollectionError({ onRetry }: { onRetry: () => void }) { return <div role="alert" data-testid="collection-error" className="mx-auto flex w-full max-w-[var(--content-max)] flex-col items-start gap-3 px-6 py-12 text-sm text-danger"><div className="flex items-center gap-2"><AlertCircleIcon className="size-4" />Could not load this database. The backend collection contract may not be available yet.</div><Button type="button" variant="outline" size="sm" onClick={onRetry}><RefreshCwIcon className="size-3.5" />Retry</Button></div>; }
function CollectionEmptyState({ title, message }: { title: string; message: string }) { return <div data-testid="collection-empty" className="rounded-lg border border-dashed border-border px-6 py-16 text-center"><h2 className="text-lg font-medium">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">{message}</p></div>; }
