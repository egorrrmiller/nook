import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { NodeIcon } from '@nook/api-client';
import { BuildingIcon } from 'lucide-react';
import { Button, ConfirmDialog, Field, Select } from '@nook/ui';
import {
  useDeleteWorkspace,
  useMe,
  useSetWorkspaceSetting,
  useUpdateWorkspace,
  useWorkspaceSettings,
} from '../../lib/queries';
import { toast } from '../../stores/toast';
import { IconPicker } from '../pickers';
import { NodeIcon as NodeIconView } from '../tree/NodeIcon';
import { SettingsActionRow, SettingsGroup, SettingsPageHeader, SettingsRow } from './SettingsSection';

const RETENTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: '0', label: 'Keep forever' },
];

export function WorkspaceSettings({ workspaceId }: { workspaceId: string }) {
  const { data: me } = useMe();
  const workspace = me?.workspaces.find((w) => w.id === workspaceId);
  const update = useUpdateWorkspace();
  const remove = useDeleteWorkspace();
  const { data: settings } = useWorkspaceSettings(workspaceId);
  const setSetting = useSetWorkspaceSetting(workspaceId);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<NodeIcon | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isOwner = workspace?.role === 'owner';

  useEffect(() => {
    if (!workspace) return;
    setName(workspace.name);
    setIcon(workspace.icon ?? null);
  }, [workspace]);

  const retention = String((settings?.['trash.retentionDays'] as number | undefined) ?? 30);
  const savedIcon = workspace?.icon ?? null;
  const iconChanged = icon?.type !== savedIcon?.type || icon?.value !== savedIcon?.value;

  return (
    <div data-testid="settings-workspace">
      <SettingsPageHeader title="General" description="Workspace name, icon and data retention." />

      <SettingsGroup title="Workspace">
        <SettingsActionRow className="gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-muted">Icon</span>
            <IconPicker value={icon} onChange={setIcon}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!isOwner}
                aria-label="Choose workspace icon"
                data-testid="workspace-icon-picker"
                className="text-lg"
              >
                {icon ? <NodeIconView icon={icon} size={20} /> : <BuildingIcon className="size-4" />}
              </Button>
            </IconPicker>
          </div>
          <Field
            label="Name"
            className="flex-1"
            value={name}
            disabled={!isOwner}
            onChange={(e) => setName(e.target.value)}
            data-testid="workspace-name"
          />
          <Button
            size="sm"
            disabled={!isOwner || !name.trim() || (name === workspace?.name && !iconChanged)}
            onClick={() =>
              update.mutate(
                { id: workspaceId, name: name.trim(), icon },
                { onSuccess: () => toast('Workspace updated') },
              )
            }
          >
            Save
          </Button>
        </SettingsActionRow>
      </SettingsGroup>

      <SettingsGroup title="Trash">
        <SettingsRow title="Keep deleted pages for" description="After this period pages in the trash are permanently deleted.">
          <Select
            aria-label="Trash retention"
            value={retention}
            disabled={!isOwner}
            onValueChange={(v) => {
              setSetting.mutate({ key: 'trash.retentionDays', value: Number(v) });
              toast('Retention updated');
            }}
            options={RETENTIONS}
            className="w-40"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Danger zone">
        <SettingsRow
          title="Delete this workspace"
          description={
            workspace?.isPersonal
              ? 'Your personal workspace cannot be deleted.'
              : 'Every page, file and setting in this workspace is removed permanently.'
          }
        >
          <Button
            variant="destructive"
            size="sm"
            disabled={!isOwner || workspace?.isPersonal}
            onClick={() => setConfirmDelete(true)}
            data-testid="delete-workspace"
          >
            Delete workspace
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        variant="destructive"
        title={`Delete “${workspace?.name ?? 'workspace'}”?`}
        description="This permanently removes the workspace and all of its content. This cannot be undone."
        confirmLabel="Delete workspace"
        onConfirm={async () => {
          await remove.mutateAsync(workspaceId);
          toast('Workspace deleted');
          await navigate({ to: '/' });
        }}
      />
    </div>
  );
}
