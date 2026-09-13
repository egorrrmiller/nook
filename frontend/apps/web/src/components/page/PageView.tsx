import { useEffect, useRef, useState } from 'react';
import { cn } from '@nook/ui';
import { NookEditor } from '@nook/editor';
import { useNode, useUpdateNode } from '../../lib/queries';
import { useEnterNode } from '../../app/realtime';
import { useMe } from '../../lib/queries';
import { useUiStore, resolveTheme } from '../../stores/ui';
import { IS_MOCK } from '../../lib/api';

export function PageView({ workspaceId, nodeId }: { workspaceId: string; nodeId: string }) {
  const { data: node } = useNode(workspaceId, nodeId);
  const { data: me } = useMe();
  const update = useUpdateNode(workspaceId);
  const theme = useUiStore((s) => s.theme);
  useEnterNode(nodeId);

  // Title is owned by the Y.Doc (contracts §3) and mirrored to nodes.title via PATCH, debounced.
  const [title, setTitle] = useState(node?.title ?? '');
  const lastSaved = useRef(node?.title ?? '');
  useEffect(() => {
    if (node && node.title !== lastSaved.current && node.title !== title) {
      lastSaved.current = node.title;
      setTitle(node.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.title]);

  useEffect(() => {
    if (title === lastSaved.current) return;
    const t = setTimeout(() => {
      lastSaved.current = title;
      update.mutate({ id: nodeId, title });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, nodeId]);

  const fullWidth = node?.pageSettings?.fullWidth ?? false;
  const toggleFullWidth = () =>
    update.mutate({ id: nodeId, pageSettings: { fullWidth: !fullWidth } });

  if (!node) return null;

  return (
    <article
      data-testid="page-view"
      className={cn(
        'mx-auto w-full px-12 pb-32 pt-12 transition-[max-width] duration-[var(--duration)]',
        fullWidth ? 'max-w-none' : 'max-w-[calc(var(--content-max)+96px)]',
        node.pageSettings?.font === 'serif' && 'font-serif',
        node.pageSettings?.font === 'mono' && 'font-mono',
        node.pageSettings?.smallText && 'text-[13px]',
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-fg-muted">
        <button
          type="button"
          onClick={toggleFullWidth}
          className="rounded-[var(--radius-sm)] px-1.5 py-0.5 hover:bg-bg-hover"
          aria-pressed={fullWidth}
        >
          {fullWidth ? 'Full width: on' : 'Full width: off'}
        </button>
        {node.effectiveRole === 'viewer' ? <span>· View only</span> : null}
      </div>
      <NookEditor
        key={nodeId}
        nodeId={nodeId}
        mode={IS_MOCK ? 'local' : 'remote'}
        initialTitle={title}
        onTitleChange={setTitle}
        user={me ? { name: me.user.displayName, color: '#2383e2' } : undefined}
        theme={resolveTheme(theme)}
        role={node.effectiveRole}
      />
    </article>
  );
}
