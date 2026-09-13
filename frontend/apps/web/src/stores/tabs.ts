import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TabState {
  id: string;
  /** Route href (path + search + hash) the tab shows. */
  href: string;
  /** Last known title (kept for the strip while the route loads). */
  title: string;
  icon?: string | null;
}

interface TabsState {
  tabs: TabState[];
  activeId: string | null;
  /** Opens a new tab at `href` (or duplicates the active one) and activates it. */
  open: (href: string, title?: string, icon?: string | null) => string;
  close: (id?: string) => void;
  activate: (id: string) => void;
  /** Moves the active tab to `href` (sidebar navigation, in-page links). */
  navigate: (href: string, title?: string, icon?: string | null) => void;
  /** Updates the label of whichever tab currently shows `href`. */
  setMeta: (href: string, title: string, icon?: string | null) => void;
  next: () => void;
  prev: () => void;
  reorder: (from: number, to: number) => void;
  /** Drops tabs that belong to another workspace and makes sure one tab exists. */
  ensure: (workspaceId: string, href: string) => void;
}

let seq = 0;
const newId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

function workspaceOf(href: string): string | null {
  const m = /^\/w\/([^/?#]+)/.exec(href);
  return m?.[1] ?? null;
}

export const useTabsStore = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeId: null,
      open: (href, title = '', icon = null) => {
        const id = newId();
        const { tabs, activeId } = get();
        const at = tabs.findIndex((t) => t.id === activeId);
        const next = [...tabs];
        next.splice(at >= 0 ? at + 1 : next.length, 0, { id, href, title, icon });
        set({ tabs: next, activeId: id });
        return id;
      },
      close: (id) => {
        const { tabs, activeId } = get();
        const target = id ?? activeId;
        if (!target) return;
        const idx = tabs.findIndex((t) => t.id === target);
        if (idx < 0) return;
        const remaining = tabs.filter((t) => t.id !== target);
        let nextActive = activeId;
        if (target === activeId) {
          const neighbour = remaining[Math.min(idx, remaining.length - 1)] ?? remaining[idx - 1];
          nextActive = neighbour?.id ?? null;
        }
        set({ tabs: remaining, activeId: nextActive });
      },
      activate: (id) => {
        if (get().tabs.some((t) => t.id === id)) set({ activeId: id });
      },
      navigate: (href, title, icon) => {
        const { tabs, activeId } = get();
        const active = tabs.find((t) => t.id === activeId);
        if (!active) {
          get().open(href, title ?? '', icon ?? null);
          return;
        }
        if (active.href === href && title === undefined) return;
        set({
          tabs: tabs.map((t) =>
            t.id === active.id
              ? {
                  ...t,
                  href,
                  title: title ?? (t.href === href ? t.title : ''),
                  icon: icon !== undefined ? icon : t.href === href ? t.icon : null,
                }
              : t,
          ),
        });
      },
      setMeta: (href, title, icon) => {
        const { tabs } = get();
        if (!tabs.some((t) => t.href === href && (t.title !== title || (icon !== undefined && t.icon !== icon)))) return;
        set({
          tabs: tabs.map((t) =>
            t.href === href ? { ...t, title, icon: icon !== undefined ? icon : t.icon } : t,
          ),
        });
      },
      next: () => {
        const { tabs, activeId } = get();
        if (tabs.length < 2) return;
        const i = tabs.findIndex((t) => t.id === activeId);
        set({ activeId: tabs[(i + 1) % tabs.length]!.id });
      },
      prev: () => {
        const { tabs, activeId } = get();
        if (tabs.length < 2) return;
        const i = tabs.findIndex((t) => t.id === activeId);
        set({ activeId: tabs[(i - 1 + tabs.length) % tabs.length]!.id });
      },
      reorder: (from, to) => {
        const tabs = [...get().tabs];
        const [moved] = tabs.splice(from, 1);
        if (!moved) return;
        tabs.splice(to, 0, moved);
        set({ tabs });
      },
      ensure: (workspaceId, href) => {
        const { tabs, activeId } = get();
        const kept = tabs.filter((t) => workspaceOf(t.href) === workspaceId);
        if (!kept.length) {
          const id = newId();
          set({ tabs: [{ id, href, title: '', icon: null }], activeId: id });
          return;
        }
        const active = kept.find((t) => t.id === activeId);
        if (active) {
          if (kept.length !== tabs.length) set({ tabs: kept });
          return;
        }
        // The active tab was dropped (other workspace): adopt the first remaining one for `href`.
        const first = kept[0]!;
        set({ tabs: kept.map((t) => (t.id === first.id ? { ...t, href } : t)), activeId: first.id });
      },
    }),
    {
      name: 'nook.tabs',
      partialize: (s) => ({ tabs: s.tabs, activeId: s.activeId }),
    },
  ),
);
