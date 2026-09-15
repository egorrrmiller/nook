import { Outlet } from '@tanstack/react-router';
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronsRightIcon } from 'lucide-react';
import { cn, IconButton, Tooltip } from '@nook/ui';
import { SearchDialog } from '../../features/knowledge';
import { useUiStore } from '../../stores/ui';
import { RealtimeProvider } from '../../app/realtime';
import { MoveToDialog } from '../tree/MoveToDialog';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Tabs } from './Tabs';
import { PeekPanel } from './PeekPanel';
import { CommandPalette } from './CommandPalette';
import { ShortcutsDialog } from './ShortcutsDialog';
import { useGlobalShortcuts } from './useGlobalShortcuts';

export function AppShell({ workspaceId }: { workspaceId: string }) {
  useGlobalShortcuts(workspaceId);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const pageMode = useUiStore((s) => s.pageMode);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const peekNodeId = useUiStore((s) => s.peekNodeId);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const moveNodeId = useUiStore((s) => s.moveNodeId);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const dragging = useRef(false);
  const focusMode = pageMode === 'focus';

  const onResizeStart = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startW = useUiStore.getState().sidebarWidth;
      const move = (ev: PointerEvent) => {
        if (!dragging.current) return;
        setSidebarWidth(startW + (ev.clientX - startX));
      };
      const up = () => {
        dragging.current = false;
        document.body.style.cursor = '';
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      document.body.style.cursor = 'col-resize';
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [setSidebarWidth],
  );

  return (
    <RealtimeProvider workspaceId={workspaceId}>
      <div
        className={cn('nook-shell flex h-dvh w-full overflow-hidden bg-bg text-fg', focusMode && 'nook-shell--focus')}
        style={{ ['--sidebar-width' as string]: `${sidebarWidth}px` }}
      >
        {!focusMode ? (
          <aside
            data-testid="sidebar"
            aria-label="Sidebar"
            className={cn(
              'relative flex h-full shrink-0 flex-col border-r border-border/70 bg-bg-sidebar transition-[width,opacity] duration-[var(--duration)] ease-[var(--ease)]',
              sidebarOpen ? 'w-[var(--sidebar-width)]' : 'w-0 opacity-0',
            )}
            aria-hidden={!sidebarOpen}
          >
            <Sidebar workspaceId={workspaceId} />
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              onPointerDown={onResizeStart}
              className="absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize hover:bg-border-strong"
            />
          </aside>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          {!focusMode ? <TopBar workspaceId={workspaceId} /> : null}
          {!focusMode ? <Tabs workspaceId={workspaceId} /> : null}
          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 overflow-y-auto">
              <Outlet />
            </main>
            {peekNodeId && !focusMode ? <PeekPanel workspaceId={workspaceId} nodeId={peekNodeId} /> : null}
          </div>
        </div>
        {!sidebarOpen && !focusMode ? (
          <div className="pointer-events-none fixed top-2 left-2 z-40">
            <Tooltip content="Open sidebar (⌘\\)">
              <IconButton
                label="Open sidebar"
                data-testid="open-sidebar"
                onClick={() => useUiStore.getState().setSidebarOpen(true)}
                className="pointer-events-auto border border-border bg-bg shadow-sm"
              >
                <ChevronsRightIcon />
              </IconButton>
            </Tooltip>
          </div>
        ) : null}
        <CommandPalette workspaceId={workspaceId} />
        {/* Mounted only while open: a hidden cmdk instance would add a second live region. */}
        {moveNodeId ? <MoveToDialog workspaceId={workspaceId} /> : null}
        <ShortcutsDialog />
        <SearchDialog workspaceId={workspaceId} open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </RealtimeProvider>
  );
}
