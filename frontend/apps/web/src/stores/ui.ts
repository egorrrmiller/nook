import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeSetting = 'system' | 'light' | 'dark' | 'hc';
export const THEMES: ThemeSetting[] = ['system', 'light', 'dark', 'hc'];

export const SIDEBAR_MIN = 200;
export const SIDEBAR_DEFAULT = 240;
export const SIDEBAR_MAX = 400;

interface UiState {
  theme: ThemeSetting;
  setTheme: (t: ThemeSetting) => void;
  cycleTheme: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  sidebarWidth: number;
  setSidebarWidth: (w: number) => void;
  /** Expanded tree nodes, keyed by node id. */
  expanded: Record<string, true>;
  toggleExpanded: (id: string, force?: boolean) => void;
  /** Favourites are client-side for now (no endpoint in contracts §2). */
  favorites: Record<string, string[]>;
  toggleFavorite: (workspaceId: string, nodeId: string) => void;
  peekNodeId: string | null;
  setPeek: (id: string | null) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** Right-hand inspector tab in PageView (contracts §10); null = closed. Not persisted. */
  inspector: InspectorTab | null;
  setInspector: (v: InspectorTab | null) => void;
  /** Opens `v`, or closes the inspector when `v` is already the active tab. */
  toggleInspector: (v: InspectorTab) => void;
  /** Full-text SearchDialog visibility (contracts §10). Not persisted. */
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

export type InspectorTab = 'backlinks' | 'history' | 'info';

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      cycleTheme: () => {
        const i = THEMES.indexOf(get().theme);
        set({ theme: THEMES[(i + 1) % THEMES.length] ?? 'system' });
      },
      sidebarOpen: true,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      sidebarWidth: SIDEBAR_DEFAULT,
      setSidebarWidth: (w) => set({ sidebarWidth: Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w))) }),
      expanded: {},
      toggleExpanded: (id, force) => {
        const next = { ...get().expanded };
        const open = force ?? !next[id];
        if (open) next[id] = true;
        else delete next[id];
        set({ expanded: next });
      },
      favorites: {},
      toggleFavorite: (ws, id) => {
        const list = get().favorites[ws] ?? [];
        const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
        set({ favorites: { ...get().favorites, [ws]: next } });
      },
      peekNodeId: null,
      setPeek: (peekNodeId) => set({ peekNodeId }),
      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      inspector: null,
      setInspector: (inspector) => set({ inspector }),
      toggleInspector: (v) => set({ inspector: get().inspector === v ? null : v }),
      searchOpen: false,
      setSearchOpen: (searchOpen) => set({ searchOpen }),
    }),
    {
      name: 'nook.ui',
      partialize: (s) => ({
        theme: s.theme,
        sidebarOpen: s.sidebarOpen,
        sidebarWidth: s.sidebarWidth,
        expanded: s.expanded,
        favorites: s.favorites,
      }),
    },
  ),
);

/**
 * Reflects the theme onto <html>. 'system' stamps nothing so `prefers-color-scheme`
 * decides; the explicit settings win over it via `[data-theme]` rules.
 */
export function applyTheme(theme: ThemeSetting): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme === 'hc' ? 'hc' : theme);
  root.style.colorScheme = theme === 'system' ? 'light dark' : theme === 'dark' ? 'dark' : 'light';
}

// Keep the DOM in sync with later theme changes (the initial call happens at bootstrap).
useUiStore.subscribe((state, prev) => {
  if (state.theme !== prev.theme) applyTheme(state.theme);
});

/** Concrete light/dark for consumers that cannot handle 'system'/'hc' (e.g. the editor theme). */
export function resolveTheme(theme: ThemeSetting): 'light' | 'dark' {
  if (theme === 'dark') return 'dark';
  if (theme === 'light' || theme === 'hc') return 'light'; // hc is a light-based high-contrast palette
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
