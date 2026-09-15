import { useState } from 'react';
import { CopyIcon, TrashIcon } from 'lucide-react';
import { ApiError, type Invite } from '@nook/api-client';
import { Avatar, Button, ConfirmDialog, Field, Input, Select, Skeleton } from '@nook/ui';
import {
  useAddMember,
  useCreateInvite,
  useInvites,
  useMe,
  useMembers,
  useRemoveMember,
  useRevokeInvite,
} from '../../lib/queries';
import { copyText, formatDate } from '../../lib/utils';
import { toast } from '../../stores/toast';
import { SettingsActionRow, SettingsGroup, SettingsList, SettingsListItem, SettingsPageHeader } from './SettingsSection';

export function MembersSettings({ workspaceId }: { workspaceId: string }) {
  const { data: me } = useMe();
  const { data: members, isPending } = useMembers(workspaceId);
  const { data: invites } = useInvites();
  const addMember = useAddMember(workspaceId);
  const removeMember = useRemoveMember(workspaceId);
  const createInvite = useCreateInvite();
  const revokeInvite = useRevokeInvite();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer' | 'owner'>('editor');
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; name: string } | null>(null);
  const [lastInvite, setLastInvite] = useState<Invite | null>(null);
  const isOwner = me?.workspaces.find((w) => w.id === workspaceId)?.role === 'owner';

  return (
    <div data-testid="settings-members">
      <SettingsPageHeader title="People" description="Members of this workspace and pending invitations." />

      <SettingsGroup title="Add a member">
        <SettingsActionRow>
          <Field
            label="Email"
            id="member-email"
            className="min-w-0 flex-1"
            value={email}
            placeholder="person@example.com"
            disabled={!isOwner}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
          />
          <Select
            aria-label="Role"
            value={role}
            onValueChange={setRole}
            disabled={!isOwner}
            options={[
              { value: 'editor', label: 'Editor' },
              { value: 'viewer', label: 'Viewer' },
              { value: 'owner', label: 'Owner' },
            ]}
            className="w-32"
          />
          <Button
            size="sm"
            disabled={!isOwner || !email.includes('@') || addMember.isPending}
            onClick={() => {
              setError(null);
              addMember.mutate(
                { email: email.trim(), role },
                {
                  onSuccess: () => {
                    setEmail('');
                    toast('Member added');
                  },
                  onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not add the member'),
                },
              );
            }}
          >
            Add
          </Button>
        </SettingsActionRow>
      </SettingsGroup>

      <SettingsGroup title="Members">
        {isPending ? (
          <Skeleton className="h-10" />
        ) : (
          <SettingsList>
            {(members ?? []).map((m) => (
              <SettingsListItem key={m.userId} data-testid="member-row">
                <Avatar name={m.displayName} size="md" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{m.displayName}</span>
                  <span className="truncate text-xs text-fg-muted">{m.email}</span>
                </span>
                <span className="text-xs text-fg-muted capitalize">{m.role}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${m.displayName}`}
                  disabled={!isOwner || m.userId === me?.user.id}
                  onClick={() => setConfirmRemove({ userId: m.userId, name: m.displayName })}
                >
                  <TrashIcon className="size-4" />
                </Button>
              </SettingsListItem>
            ))}
          </SettingsList>
        )}
      </SettingsGroup>

      <SettingsGroup title="Invitations">
        <SettingsActionRow className="items-center">
          <Button
            size="sm"
            variant="secondary"
            disabled={!isOwner || createInvite.isPending}
            data-testid="create-invite"
            onClick={() =>
              createInvite.mutate(
                { expiresInHours: 72 },
                {
                  onSuccess: (inv) => {
                    setLastInvite(inv);
                    toast('Invite link created');
                  },
                },
              )
            }
          >
            Create invite link
          </Button>
          {lastInvite ? (
            <>
              <Input readOnly value={lastInvite.url} className="flex-1 font-mono text-xs" aria-label="Invite link" />
              <Button size="sm" variant="outline" onClick={() => void copyText(lastInvite.url, 'Invite link copied')}>
                <CopyIcon /> Copy
              </Button>
            </>
          ) : null}
        </SettingsActionRow>
        <SettingsList>
          {(invites ?? []).map((inv) => (
            <SettingsListItem key={inv.code} data-testid="invite-row">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-mono text-sm">{inv.code}</span>
                <span className="text-xs text-fg-muted">
                  {inv.email ? `${inv.email} · ` : ''}
                  {inv.usedAt ? `used ${formatDate(inv.usedAt)}` : `expires ${formatDate(inv.expiresAt)}`}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void copyText(`${window.location.origin}/register?invite=${inv.code}`, 'Invite link copied')}
              >
                <CopyIcon /> Copy link
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Revoke invite ${inv.code}`}
                disabled={!isOwner}
                onClick={() => revokeInvite.mutate(inv.code, { onSuccess: () => toast('Invite revoked') })}
              >
                <TrashIcon className="size-4" />
              </Button>
            </SettingsListItem>
          ))}
          {!invites?.length ? <SettingsListItem className="py-3 text-sm text-fg-muted">No pending invitations.</SettingsListItem> : null}
        </SettingsList>
      </SettingsGroup>

      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
        variant="destructive"
        title={`Remove ${confirmRemove?.name ?? 'member'}?`}
        description="They lose access to this workspace immediately."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!confirmRemove) return;
          await removeMember.mutateAsync(confirmRemove.userId);
          toast('Member removed');
        }}
      />
    </div>
  );
}
