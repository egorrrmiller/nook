import { useEffect, useSyncExternalStore } from 'react';
import { useUiStore, type ThemeSetting } from '../stores/ui';

const mq = () => (typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function resolveTheme(setting: ThemeSetting): 'light' | 'dark' {
  if (setting === 'dark') return 'dark';
  if (setting === 'light' || setting === 'hc') return 'light';
  return mq()?.matches ? 'dark' : 'light';
}

/** Writes `data-theme` (and a `.dark` mirror for third-party CSS) on <html>. */
export function applyTheme(setting: ThemeSetting): void {
  const root = document.documentElement;
  if (setting === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', setting);
  root.classList.toggle('dark', resolveTheme(setting) === 'dark');
}

export function useThemeEffect(): void {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    const m = mq();
    if (!m) return;
    const onChange = () => applyTheme(useUiStore.getState().theme);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, [theme]);
}

function subscribeSystem(cb: () => void) {
  const m = mq();
  if (!m) return () => {};
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}

/** 'light' | 'dark' as actually rendered (for BlockNote's `theme` prop). */
export function useResolvedTheme(): 'light' | 'dark' {
  const setting = useUiStore((s) => s.theme);
  const systemDark = useSyncExternalStore(subscribeSystem, () => mq()?.matches ?? false, () => false);
  if (setting === 'dark') return 'dark';
  if (setting === 'light' || setting === 'hc') return 'light';
  return systemDark ? 'dark' : 'light';
}
