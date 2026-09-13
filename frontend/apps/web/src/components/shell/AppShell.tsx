import { Outlet } from '@tanstack/react-router';
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@nook/ui';
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
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const peekNodeId = useUiStore((s) => s.peekNodeId);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const moveNodeId = useUiStore((s) => s.moveNodeId);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const dragging = useRef(false);

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
        className="flex h-dvh w-full overflow-hidden bg-bg text-fg"
        style={{ ['--sidebar-width' as string]: `${sidebarWidth}px` }}
      >
        <aside
          data-testid="sidebar"
          aria-label="Sidebar"
          className={cn(
            'relative flex h-full shrink-0 flex-col bg-bg-sidebar transition-[width,opacity] duration-[var(--duration)] ease-[var(--ease)]',
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
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar workspaceId={workspaceId} />
          <Tabs workspaceId={workspaceId} />
          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 overflow-y-auto">
              <Outlet />
            </main>
            {peekNodeId ? <PeekPanel workspaceId={workspaceId} nodeId={peekNodeId} /> : null}
          </div>
        </div>
        <CommandPalette workspaceId={workspaceId} />
        {/* Mounted only while open: a hidden cmdk instance would add a second live region. */}
        {moveNodeId ? <MoveToDialog workspaceId={workspaceId} /> : null}
        <ShortcutsDialog />
        <SearchDialog workspaceId={workspaceId} open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </RealtimeProvider>
  );
}
