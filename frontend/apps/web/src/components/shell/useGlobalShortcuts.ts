import { useEffect } from 'react';
import { useUiStore } from '../../stores/ui';

/** ⌘K → command palette, ⌘\ → toggle sidebar. */
export function useGlobalShortcuts() {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'k' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setPaletteOpen(!useUiStore.getState().paletteOpen);
      } else if (e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen, toggleSidebar]);
}
