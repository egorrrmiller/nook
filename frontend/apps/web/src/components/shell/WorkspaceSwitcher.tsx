import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronsUpDownIcon, CheckIcon, LogOutIcon, SunMoonIcon, PlusIcon } from 'lucide-react';
import {
  Avatar,
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@nook/ui';
import { useMe } from '../../lib/queries';
import { signOut } from '../../app/auth';
import { useUiStore, type ThemeSetting } from '../../stores/ui';
import { toast } from '../../stores/toast';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queries';
import { NodeIcon } from '../tree/NodeIcon';

const THEMES: { value: ThemeSetting; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'hc', label: 'High contrast' },
];

export function WorkspaceSwitcher({ workspaceId }: { workspaceId: string }) {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const current = me?.workspaces.find((w) => w.id === workspaceId);

  async function createWorkspace() {
    const name = window.prompt('Workspace name');
    if (!name?.trim()) return;
    const ws = await api.workspaces.create({ name: name.trim() });
    await qc.invalidateQueries({ queryKey: queryKeys.me });
    await navigate({ to: '/w/$workspaceId', params: { workspaceId: ws.id } });
  }

  return (
    <Menu>
      <MenuTrigger
        data-testid="workspace-switcher"
        className="group flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] px-2 text-left text-[13px] font-medium text-fg transition-colors duration-[var(--duration)] hover:bg-bg-hover"
      >
        <span className="flex size-6 items-center justify-center rounded-[var(--radius-sm)] bg-fg text-[11px] font-semibold text-bg shadow-sm">
          {current?.icon ? <NodeIcon icon={current.icon} size={18} /> : current?.name.slice(0, 1).toUpperCase() ?? '?'}
        </span>
        <span className="min-w-0 flex-1 truncate">{current?.name ?? 'Workspace'}</span>
        <ChevronsUpDownIcon className="size-3.5 text-fg-muted transition-transform group-hover:translate-y-px" />
      </MenuTrigger>
      <MenuContent className="w-64">
        <MenuGroup>
          <MenuLabel>{me?.user.email}</MenuLabel>
          {me?.workspaces.map((w) => (
            <MenuItem
              key={w.id}
              onClick={() => navigate({ to: '/w/$workspaceId', params: { workspaceId: w.id } })}
            >
              <span className="flex size-5 items-center justify-center rounded-[var(--radius-sm)] bg-bg-active text-xs">
                {w.icon ? <NodeIcon icon={w.icon} size={16} /> : w.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <span className="text-xs text-fg-muted">{w.role}</span>
              {w.id === workspaceId ? <CheckIcon /> : null}
            </MenuItem>
          ))}
          <MenuItem onClick={createWorkspace}>
            <PlusIcon />
            New workspace
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuLabel>
            <span className="inline-flex items-center gap-1">
              <SunMoonIcon className="size-3.5" /> Theme
            </span>
          </MenuLabel>
          {THEMES.map((t) => (
            <MenuItem key={t.value} onClick={() => setTheme(t.value)}>
              <span className="flex-1">{t.label}</span>
              {theme === t.value ? <CheckIcon /> : null}
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem
          className="text-fg-secondary"
          onClick={async () => {
            await signOut(qc);
            toast('Signed out');
            await navigate({ to: '/login' });
          }}
        >
          <Avatar name={me?.user.displayName ?? '?'} src={me?.user.avatarUrl} size="sm" />
          <span className="flex-1">Log out</span>
          <LogOutIcon />
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
