import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Block, HistoryEntry, Version } from '@nook/api-client';
import { BlocksView } from '@nook/editor';
import { Button, Skeleton, cn } from '@nook/ui';
import { HistoryIcon, RotateCcwIcon, SaveIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { useRealtime } from '../../app/realtime';
import { useUiStore, resolveTheme } from '../../stores/ui';
import { collapseUnchanged, diffBlocks, summarise, type BlockDiffEntry } from './diff';

const POLL_MS = 30_000;

export const historyKeys = {
  list: (nodeId: string) => ['history', nodeId] as const,
  version: (nodeId: string, versionId: string) => ['history', nodeId, versionId] as const,
  current: (nodeId: string) => ['node-blocks', nodeId] as const,
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString();
}

const KIND_LABEL: Record<Version['kind'], string> = {
  auto: 'Auto',
  manual: 'Saved',
  'pre-restore': 'Before restore',
};

/**
 * Inspector tab "History" (contracts §9.7 / §10): versions list, manual save, preview, a
 * block-level diff against the previous version and restore.
 */
export function PageHistoryPanel({ workspaceId, nodeId }: { workspaceId: string; nodeId: string }) {
  const qc = useQueryClient();
  const realtime = useRealtime();
  const theme = resolveTheme(useUiStore((s) => s.theme));
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'diff' | 'preview'>('diff');
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const versions = useQuery({
    queryKey: historyKeys.list(nodeId),
    queryFn: () => api.nodes.history(nodeId, { limit: 50 }),
    // §9.9 sends `historyChanged` over the hub, but `app/realtime.tsx` has no generic
    // subscription hook yet (the coordinator asked frontend-shell for `useHubEvent`). Until then:
    // refetch on focus + a 30 s poll, plus a direct subscription on the raw connection when the
    // hub is up (read-only use of the shared client).
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const conn = realtime?.connection;
    if (!conn) return;
    const handler = (payload: { nodeId: string }) => {
      if (payload?.nodeId === nodeId) void qc.invalidateQueries({ queryKey: historyKeys.list(nodeId) });
    };
    conn.on('historyChanged', handler);
    return () => conn.off('historyChanged', handler);
  }, [realtime, nodeId, qc]);

  const items = versions.data?.items ?? [];
  const activeId = selected ?? items[0]?.id ?? null;
  const activeIndex = items.findIndex((v) => v.id === activeId);
  const baseline = activeIndex >= 0 ? items[activeIndex + 1] : undefined;

  const version = useQuery({
    queryKey: historyKeys.version(nodeId, activeId ?? ''),
    queryFn: () => api.nodes.historyVersion(nodeId, activeId!),
    enabled: !!activeId,
  });
  const previous = useQuery({
    queryKey: historyKeys.version(nodeId, baseline?.id ?? ''),
    queryFn: () => api.nodes.historyVersion(nodeId, baseline!.id),
    enabled: !!baseline?.id && mode === 'diff',
  });

  const save = useMutation({
    mutationFn: () => api.nodes.saveVersion(nodeId),
    onSuccess: (v) => {
      setSelected(v.id);
      void qc.invalidateQueries({ queryKey: historyKeys.list(nodeId) });
    },
  });
  const restore = useMutation({
    mutationFn: (versionId: string) => api.nodes.restoreVersion(nodeId, versionId),
    onSuccess: () => {
      setConfirmRestore(null);
      void qc.invalidateQueries({ queryKey: historyKeys.list(nodeId) });
      void qc.invalidateQueries({ queryKey: ['node', workspaceId, nodeId] });
    },
  });

  const entries = useMemo<BlockDiffEntry[]>(() => {
    if (mode !== 'diff' || !version.data) return [];
    return diffBlocks(previous.data?.blocks ?? [], version.data.blocks);
  }, [mode, version.data, previous.data]);
  const summary = useMemo(() => summarise(entries), [entries]);
  const rows = useMemo(() => collapseUnchanged(entries, 1), [entries]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="history-panel">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <HistoryIcon className="size-4 text-fg-muted" />
        <span className="text-sm font-medium">Version history</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          data-testid="save-version"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          <SaveIcon className="size-4" /> Save version
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="border-b border-border p-1" data-testid="version-list">
          {versions.isPending ? (
            <li className="p-2">
              <Skeleton className="h-10" />
            </li>
          ) : items.length === 0 ? (
            <li className="p-3 text-sm text-fg-muted">No versions yet. Save one to start the history.</li>
          ) : (
            items.map((v) => (
              <li key={v.id}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="version-item"
                  data-active={v.id === activeId || undefined}
                  onClick={() => setSelected(v.id)}
                  className={cn(
                    'h-auto w-full flex-col items-start gap-0.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left hover:bg-bg-hover',
                    v.id === activeId && 'bg-bg-hover',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{relativeTime(v.takenAt)}</span>
                    <span className="rounded-[var(--radius-sm)] bg-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg-muted">
                      {KIND_LABEL[v.kind]}
                    </span>
                  </span>
                  <span className="text-xs text-fg-muted">
                    v{v.version} · {v.blockCount} blocks{v.user ? ` · ${v.user.displayName}` : ''}
                  </span>
                </Button>
              </li>
            ))
          )}
        </ul>

        {activeId ? (
          <div className="p-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex rounded-[var(--radius-sm)] bg-accent p-0.5 text-xs">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  data-testid="diff-tab"
                  onClick={() => setMode('diff')}
                  className={cn('rounded-[var(--radius-sm)] px-2 py-0.5', mode === 'diff' && 'bg-bg shadow-[var(--shadow-sm)]')}
                >
                  Diff
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  data-testid="preview-tab"
                  onClick={() => setMode('preview')}
                  className={cn('rounded-[var(--radius-sm)] px-2 py-0.5', mode === 'preview' && 'bg-bg shadow-[var(--shadow-sm)]')}
                >
                  Preview
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                data-testid="restore-version"
                onClick={() => setConfirmRestore(activeId)}
              >
                <RotateCcwIcon className="size-4" /> Restore
              </Button>
            </div>

            {confirmRestore ? (
              <div className="mb-2 rounded-[var(--radius)] border border-border bg-bg p-2 text-sm" data-testid="restore-confirm">
                Restore this version? The current content is snapshotted first.
                <div className="mt-2 flex gap-2">
                  <Button size="sm" data-testid="restore-confirm-yes" disabled={restore.isPending} onClick={() => restore.mutate(confirmRestore)}>
                    Restore
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {version.isPending ? (
              <Skeleton className="h-24" />
            ) : mode === 'preview' ? (
              <div className="rounded-[var(--radius)] border border-border p-2" data-testid="version-preview">
                <BlocksView blocks={version.data?.blocks ?? []} theme={theme} compact />
              </div>
            ) : (
              <DiffView rows={rows} summary={summary} hasBaseline={!!baseline} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DiffView({
  rows,
  summary,
  hasBaseline,
}: {
  rows: (BlockDiffEntry | { op: 'gap'; count: number })[];
  summary: ReturnType<typeof summarise>;
  hasBaseline: boolean;
}) {
  return (
    <div data-testid="version-diff">
      <p className="mb-2 text-xs text-fg-muted">
        {hasBaseline ? 'Compared with the previous version' : 'First version — everything is new'} ·{' '}
        <span className="text-emerald-600">+{summary.added}</span> <span className="text-red-500">−{summary.removed}</span> ·{' '}
        {summary.changed} changed
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {rows.map((row, i) =>
          row.op === 'gap' ? (
            <li key={`gap-${i}`} className="py-1 text-center text-xs text-fg-muted">
              … {row.count} unchanged block{row.count === 1 ? '' : 's'}
            </li>
          ) : (
            <li
              key={row.id}
              data-testid={`diff-${row.op}`}
              data-block-type={row.type}
              style={{ marginLeft: row.depth * 12 }}
              className={cn(
                'rounded-[var(--radius-sm)] border-l-2 px-2 py-1',
                row.op === 'added' && 'border-emerald-500 bg-emerald-500/10',
                row.op === 'removed' && 'border-red-500 bg-red-500/10 line-through opacity-70',
                row.op === 'changed' && 'border-amber-500 bg-amber-500/10',
                row.op === 'unchanged' && 'border-transparent text-fg-muted',
              )}
            >
              {row.op === 'changed' && row.segments ? (
                <span>
                  {row.segments.map((s, si) => (
                    <span
                      key={si}
                      className={cn(
                        s.op === 'insert' && 'rounded-sm bg-emerald-500/25',
                        s.op === 'delete' && 'rounded-sm bg-red-500/25 line-through',
                      )}
                    >
                      {s.text}
                    </span>
                  ))}
                </span>
              ) : (
                <span>{row.text.after || row.text.before || <em className="text-fg-muted">{row.type}</em>}</span>
              )}
              {row.propsOnly ? <span className="ml-2 text-xs text-fg-muted">(formatting)</span> : null}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

export type { Block, HistoryEntry };
