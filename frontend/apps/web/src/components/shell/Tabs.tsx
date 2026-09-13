import { useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { PlusIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, type MouseEvent } from 'react';
import { IconButton, Tooltip, cn } from '@nook/ui';
import { useNode } from '../../lib/queries';
import { emojiOf, modKey, nodeTitle } from '../../lib/utils';
import { useTabsStore } from '../../stores/tabs';
import { NodeIcon } from '../tree/NodeIcon';

/**
 * Browser-like tab strip. Each tab remembers its route; navigating (sidebar, links, palette) moves
 * the active tab, ⌘T opens a new one, ⌘W closes it, ⌘⇧[ / ⌘⇧] switch.
 */
export function Tabs({ workspaceId }: { workspaceId: string }) {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { nodeId?: string };
  const href = location.href;
  const { data: node } = useNode(workspaceId, params.nodeId ?? '', !!params.nodeId);
  const lastActive = useRef<string | null>(activeId);

  // Route → active tab. `ensure` also drops tabs left over from another workspace.
  // The two directions (route → tab, tab → route) are deliberately keyed on *different* triggers:
  // this one on `href`, the one below on `activeId` only. Reacting to both in one effect makes the
  // router and the store chase each other.
  useEffect(() => {
    const store = useTabsStore.getState();
    store.ensure(workspaceId, href);
    const active = store.tabs.find((t) => t.id === store.activeId);
    if (active && active.href !== href) store.navigate(href);
    lastActive.current = useTabsStore.getState().activeId;
  }, [href, workspaceId]);

  // Keep the active tab's label in sync with the page it shows.
  useEffect(() => {
    const label = params.nodeId ? (node ? nodeTitle(node.title) : '') : 'Home';
    if (label) useTabsStore.getState().setMeta(href, label, params.nodeId ? emojiOf(node?.icon) : null);
  }, [href, node, params.nodeId]);

  // Active tab → route: only when the *selection* changed (click, ⌘⇧[ / ⌘⇧], ⌘W).
  useEffect(() => {
    if (activeId === lastActive.current) return;
    lastActive.current = activeId;
    const active = useTabsStore.getState().tabs.find((t) => t.id === activeId);
    if (active && active.href !== window.location.pathname + window.location.search) {
      void navigate({ href: active.href });
    }
  }, [activeId, navigate]);

  if (tabs.length < 2) return null;

  const onAuxClick = (e: MouseEvent, id: string) => {
    if (e.button === 1) {
      e.preventDefault();
      useTabsStore.getState().close(id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Open tabs"
      data-testid="tab-strip"
      className="flex h-[var(--tabbar-height)] shrink-0 items-end gap-px overflow-x-auto border-b border-border px-2"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            data-testid="tab"
            onClick={() => useTabsStore.getState().activate(tab.id)}
            onAuxClick={(e) => onAuxClick(e, tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') useTabsStore.getState().activate(tab.id);
            }}
            className={cn(
              'group flex h-7 min-w-[120px] max-w-[200px] cursor-default items-center gap-1.5 rounded-t-[var(--radius-sm)] px-2 text-[13px] transition-colors duration-[var(--duration)]',
              active ? 'bg-bg font-medium text-fg' : 'text-fg-secondary hover:bg-bg-hover',
            )}
          >
            {tab.icon ? (
              <span className="shrink-0 text-sm leading-none">{tab.icon}</span>
            ) : (
              <NodeIcon size={16} className="shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{tab.title || 'Untitled'}</span>
            <button
              type="button"
              aria-label={`Close ${tab.title || 'tab'}`}
              data-testid="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                useTabsStore.getState().close(tab.id);
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded-[3px] text-fg-muted opacity-0 hover:bg-bg-active hover:text-fg group-hover:opacity-100 aria-hidden:opacity-0"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        );
      })}
      <Tooltip content={`New tab (${modKey()}T)`}>
        <IconButton
          label="New tab"
          size="icon-sm"
          tooltip={false}
          className="mb-0.5 ml-1 text-fg-muted"
          data-testid="tab-new"
          onClick={() => useTabsStore.getState().open(`/w/${workspaceId}`, 'Home')}
        >
          <PlusIcon />
        </IconButton>
      </Tooltip>
    </div>
  );
}
