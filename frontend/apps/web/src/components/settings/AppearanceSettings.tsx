import { useEffect } from 'react';
import { Button, Select, Switch, cn } from '@nook/ui';
import {
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  THEMES,
  useUiStore,
  type ThemeSetting,
} from '../../stores/ui';
import { useMeSettings, useSetMeSetting } from '../../lib/queries';
import { toast } from '../../stores/toast';
import { SettingsGroup, SettingsPageHeader, SettingsRow } from './SettingsSection';

const THEME_LABELS: Record<ThemeSetting, string> = {
  system: 'Use system setting',
  light: 'Light',
  dark: 'Dark',
  hc: 'High contrast',
};

/** Theme + sidebar width, mirrored to `api.me.settings` so they follow the user across devices. */
export function AppearanceSettings() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const showArchived = useUiStore((s) => s.showArchived);
  const setShowArchived = useUiStore((s) => s.setShowArchived);
  const { data: remote } = useMeSettings();
  const save = useSetMeSetting();

  // Adopt the server's values once (first load on a new device).
  useEffect(() => {
    if (!remote) return;
    const t = remote.theme;
    if (typeof t === 'string' && THEMES.includes(t as ThemeSetting) && t !== theme) setTheme(t as ThemeSetting);
    const w = remote.sidebarWidth;
    if (typeof w === 'number' && w !== sidebarWidth) setSidebarWidth(w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote]);

  return (
    <div data-testid="settings-appearance">
      <SettingsPageHeader title="Appearance" description="These preferences are stored on the server and follow you across devices." />

      <SettingsGroup title="Theme">
        <div className="flex gap-3 py-3">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              data-testid={`theme-${t}`}
              onClick={() => {
                setTheme(t);
                save.mutate({ key: 'theme', value: t });
              }}
              className={cn(
                'flex w-32 flex-col gap-2 rounded-[var(--radius)] border border-border p-2 text-left text-xs transition-colors hover:bg-bg-hover',
                theme === t && 'border-brand ring-1 ring-brand',
              )}
            >
              <span
                className={cn(
                  'flex h-14 w-full items-end gap-1 rounded-[var(--radius-sm)] border border-border p-1.5',
                  t === 'dark' ? 'bg-[#191919]' : t === 'hc' ? 'bg-white' : 'bg-white',
                  t === 'system' && 'bg-gradient-to-r from-white to-[#191919]',
                )}
              >
                <span className={cn('h-full w-1/3 rounded-[3px]', t === 'dark' ? 'bg-[#202020]' : 'bg-[#f7f7f5]', t === 'hc' && 'bg-[#f0f0f0] outline outline-black')} />
                <span className={cn('h-2 flex-1 rounded-full', t === 'dark' ? 'bg-[#3d3d3d]' : 'bg-[#e3e2e0]')} />
              </span>
              <span className="font-medium">{THEME_LABELS[t]}</span>
            </button>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Sidebar">
        <SettingsRow title="Sidebar width" description={`Between ${SIDEBAR_MIN} and ${SIDEBAR_MAX} px. Drag the sidebar edge for fine control.`}>
          <input
            type="range"
            min={SIDEBAR_MIN}
            max={SIDEBAR_MAX}
            step={4}
            value={sidebarWidth}
            aria-label="Sidebar width"
            data-testid="sidebar-width"
            onChange={(e) => setSidebarWidth(Number(e.target.value))}
            onPointerUp={() => save.mutate({ key: 'sidebarWidth', value: useUiStore.getState().sidebarWidth })}
            className="w-48 accent-[var(--primary)]"
          />
          <span className="w-12 text-right text-xs tabular-nums text-fg-muted">{sidebarWidth}px</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSidebarWidth(SIDEBAR_DEFAULT);
              save.mutate({ key: 'sidebarWidth', value: SIDEBAR_DEFAULT });
            }}
          >
            Reset
          </Button>
        </SettingsRow>
        <SettingsRow title="Show archived pages" description="Archived pages stay in the sidebar, dimmed, instead of being hidden.">
          <Switch
            checked={showArchived}
            onCheckedChange={(v) => {
              setShowArchived(v);
              save.mutate({ key: 'showArchived', value: v });
            }}
            aria-label="Show archived pages"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Editor defaults">
        <SettingsRow title="Default page font" description="Applied to new pages; change it per page from the ⋯ menu.">
          <Select
            aria-label="Default page font"
            value={String(remote?.defaultFont ?? 'default')}
            onValueChange={(v) => {
              save.mutate({ key: 'defaultFont', value: v });
              toast('Default font updated');
            }}
            options={[
              { value: 'default', label: 'Default' },
              { value: 'serif', label: 'Serif' },
              { value: 'mono', label: 'Mono' },
            ]}
            className="w-40"
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}
