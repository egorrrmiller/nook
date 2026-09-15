import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useCreateNode, useDuplicateNode } from '../../lib/queries';
import { useTabsStore } from '../../stores/tabs';
import { useUiStore } from '../../stores/ui';
import { toast } from '../../stores/toast';

function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || node.isContentEditable === true;
}

/**
 * Shell-wide shortcuts (documented in ShortcutsDialog):
 * ⌘K/⌘P palette · ⌘⇧F search · ⌘\ sidebar · ⌘T/⌘W/⌘⇧[ ⌘⇧] tabs · ⌘⇧N new page ·
 * ⌘, settings · ⌘D duplicate · ⌘⇧P move to… · Esc closes what is open.
 */
export function useGlobalShortcuts(workspaceId: string) {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { nodeId?: string };
  const nodeId = params.nodeId ?? null;
  const create = useCreateNode(workspaceId);
  const duplicate = useDuplicateNode(workspaceId);

  useEffect(() => {
    const handle = async (e: KeyboardEvent) => {
      const ui = useUiStore.getState();
      const tabs = useTabsStore.getState();

      if (e.key === 'Escape') {
        if (ui.paletteOpen) ui.setPaletteOpen(false);
        else if (ui.shortcutsOpen) ui.setShortcutsOpen(false);
        else if (ui.moveNodeId) ui.setMoveNodeId(null);
        else if (ui.searchOpen) ui.setSearchOpen(false);
        else if (ui.peekNodeId) ui.setPeek(null);
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      // ⌘⇧[ / ⌘⇧] arrive as '{' / '}' on some layouts; match both.
      if (e.shiftKey && (key === ']' || key === '}')) {
        e.preventDefault();
        tabs.next();
        return;
      }
      if (e.shiftKey && (key === '[' || key === '{')) {
        e.preventDefault();
        tabs.prev();
        return;
      }

      if (e.shiftKey && key === 'f') {
        e.preventDefault();
        ui.setSearchOpen(true);
        return;
      }
      if (e.shiftKey && key === 'n') {
        e.preventDefault();
        const node = await create.mutateAsync({ kind: 'page', title: '' });
        await navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: node.id } });
        return;
      }
      if (e.shiftKey && key === 'p') {
        e.preventDefault();
        if (nodeId) ui.setMoveNodeId(nodeId);
        return;
      }

      // `event.key` is `|` on some keyboard layouts even when the physical
      // Backslash key is used. Keep the physical-key fallback so a hidden
      // sidebar can always be restored with the documented shortcut.
      if (e.code === 'Backslash' && !e.shiftKey) {
        e.preventDefault();
        ui.toggleSidebar();
        return;
      }

      switch (key) {
        case 'k':
        case 'p':
          if (e.shiftKey || e.altKey) break;
          e.preventDefault();
          ui.setPaletteOpen(!ui.paletteOpen);
          break;
        case '\\':
        case '|':
          e.preventDefault();
          ui.toggleSidebar();
          break;
        case ',':
          e.preventDefault();
          void navigate({ to: '/w/$workspaceId/settings/$section', params: { workspaceId, section: 'account' } });
          break;
        case 't':
          e.preventDefault();
          tabs.open(`/w/${workspaceId}`, 'Home');
          break;
        case 'w':
          if (useTabsStore.getState().tabs.length < 2) break; // let the browser keep its own behaviour
          e.preventDefault();
          tabs.close();
          break;
        case 'd':
          if (!nodeId || isTypingTarget(e.target)) break;
          e.preventDefault();
          {
            const dup = await duplicate.mutateAsync({ id: nodeId });
            toast('Page duplicated');
            await navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: dup.id } });
          }
          break;
      }
    };
    const onKey = (e: KeyboardEvent) => void handle(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [create, duplicate, navigate, nodeId, workspaceId]);
}
