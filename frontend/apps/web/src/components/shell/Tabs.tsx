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

  useEffect(() => {
    if (!activeId) return;
    document.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

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
      className="nook-tabs flex h-[var(--tabbar-height)] shrink-0 items-end gap-1 overflow-x-auto border-b border-border px-2"
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
            data-tab-id={tab.id}
            onClick={() => useTabsStore.getState().activate(tab.id)}
            onAuxClick={(e) => onAuxClick(e, tab.id)}
            onKeyDown={(e) => {
              const index = tabs.findIndex((item) => item.id === tab.id);
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                useTabsStore.getState().activate(tab.id);
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const next = e.key === 'ArrowRight' ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
                useTabsStore.getState().activate(tabs[next]!.id);
              } else if (e.key === 'Home') {
                e.preventDefault();
                useTabsStore.getState().activate(tabs[0]!.id);
              } else if (e.key === 'End') {
                e.preventDefault();
                useTabsStore.getState().activate(tabs[tabs.length - 1]!.id);
              } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                useTabsStore.getState().close(tab.id);
              }
            }}
            title={tab.title || 'Untitled'}
            className={cn(
              'nook-tabs__tab group flex h-8 min-w-[136px] max-w-[240px] cursor-default items-center gap-2 rounded-t-[var(--radius-sm)] border border-transparent px-2.5 text-[13px] transition-colors duration-[var(--duration)]',
              active ? 'nook-tabs__tab--active bg-bg font-medium text-fg' : 'text-fg-secondary hover:bg-bg-hover',
            )}
          >
            {tab.icon ? (
              <span className="shrink-0 text-sm leading-none">{tab.icon}</span>
            ) : (
              <NodeIcon size={16} className="shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{tab.title || 'Untitled'}</span>
            <IconButton
              label={`Close ${tab.title || 'tab'}`}
              tooltip={false}
              size="icon-sm"
              data-testid="tab-close"
              title={`Close ${tab.title || 'tab'}`}
              onClick={(e) => {
                e.stopPropagation();
                useTabsStore.getState().close(tab.id);
              }}
              className="size-4 shrink-0 rounded-[3px] text-fg-muted opacity-0 hover:bg-bg-active hover:text-fg group-hover:opacity-100 aria-hidden:opacity-0"
            >
              <XIcon className="size-3" />
            </IconButton>
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
