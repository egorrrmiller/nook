import { Link, useNavigate } from '@tanstack/react-router';
import {
  DownloadIcon,
  KeyRoundIcon,
  PaletteIcon,
  UserIcon,
  UsersIcon,
  XIcon,
  BuildingIcon,
  PuzzleIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { IconButton, cn } from '@nook/ui';
import { usePluginSettingsPages } from '@nook/plugin-sdk';
import { useMe } from '../../lib/queries';
import { AccountSettings } from './AccountSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { WorkspaceSettings } from './WorkspaceSettings';
import { MembersSettings } from './MembersSettings';
import { TokensSettings } from './TokensSettings';
import { ImportExportSettings } from './ImportExportSettings';

export const SETTINGS_SECTIONS = [
  'account',
  'appearance',
  'workspace',
  'members',
  'tokens',
  'import-export',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function isSettingsSection(v: string): v is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(v);
}

const NAV: { section: SettingsSection; label: string; icon: ComponentType<{ className?: string }>; group: 'account' | 'workspace' }[] = [
  { section: 'account', label: 'My account', icon: UserIcon, group: 'account' },
  { section: 'appearance', label: 'Appearance', icon: PaletteIcon, group: 'account' },
  { section: 'tokens', label: 'API tokens', icon: KeyRoundIcon, group: 'account' },
  { section: 'workspace', label: 'General', icon: BuildingIcon, group: 'workspace' },
  { section: 'members', label: 'People', icon: UsersIcon, group: 'workspace' },
  { section: 'import-export', label: 'Import / export', icon: DownloadIcon, group: 'workspace' },
];

/** Notion-style settings: a two-pane layout (nav + section) filling the content area. */
export function SettingsScreen({ workspaceId, section }: { workspaceId: string; section: string }) {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const pluginPages = usePluginSettingsPages();
  const workspace = me?.workspaces.find((w) => w.id === workspaceId);

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl gap-6 px-6 py-8" data-testid="settings-screen">
      <nav className="w-52 shrink-0" aria-label="Settings sections">
        <div className="mb-1 px-2 text-xs font-medium text-fg-muted">{me?.user.email}</div>
        {NAV.filter((n) => n.group === 'account').map((n) => (
          <SettingsLink key={n.section} workspaceId={workspaceId} item={n} active={section === n.section} />
        ))}
        <div className="mt-4 mb-1 truncate px-2 text-xs font-medium text-fg-muted">{workspace?.name ?? 'Workspace'}</div>
        {NAV.filter((n) => n.group === 'workspace').map((n) => (
          <SettingsLink key={n.section} workspaceId={workspaceId} item={n} active={section === n.section} />
        ))}
        {pluginPages.length ? (
          <>
            <div className="mt-4 mb-1 px-2 text-xs font-medium text-fg-muted">Plugins</div>
            {pluginPages.map((p) => (
              <span key={`${p.pluginId}:${p.id}`} className="flex h-7 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-sm text-fg-secondary">
                <PuzzleIcon className="size-4 text-fg-muted" />
                <span className="truncate">{p.title}</span>
              </span>
            ))}
          </>
        ) : null}
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto pr-1">
        <div className="mb-4 flex items-start">
          <div className="min-w-0 flex-1" />
          <IconButton
            label="Close settings"
            onClick={() => navigate({ to: '/w/$workspaceId', params: { workspaceId } })}
            data-testid="settings-close"
          >
            <XIcon />
          </IconButton>
        </div>
        {section === 'account' ? <AccountSettings /> : null}
        {section === 'appearance' ? <AppearanceSettings /> : null}
        {section === 'workspace' ? <WorkspaceSettings workspaceId={workspaceId} /> : null}
        {section === 'members' ? <MembersSettings workspaceId={workspaceId} /> : null}
        {section === 'tokens' ? <TokensSettings /> : null}
        {section === 'import-export' ? <ImportExportSettings workspaceId={workspaceId} /> : null}
      </div>
    </div>
  );
}

function SettingsLink({
  workspaceId,
  item,
  active,
}: {
  workspaceId: string;
  item: (typeof NAV)[number];
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      to="/w/$workspaceId/settings/$section"
      params={{ workspaceId, section: item.section }}
      data-testid={`settings-nav-${item.section}`}
      className={cn(
        'flex h-7 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-sm text-fg-secondary transition-colors hover:bg-bg-hover hover:text-fg',
        active && 'bg-bg-active font-medium text-fg',
      )}
    >
      <Icon className="size-4 text-fg-muted" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
