import { useEffect, useState } from 'react';
import { ApiError } from '@nook/api-client';
import { Avatar, Button, Field } from '@nook/ui';
import { useChangePassword, useMe, useUpdateMe } from '../../lib/queries';
import { toast } from '../../stores/toast';
import { SettingsForm, SettingsGroup, SettingsPageHeader, SettingsRow } from './SettingsSection';

export function AccountSettings() {
  const { data: me } = useMe();
  const update = useUpdateMe();
  const changePassword = useChangePassword();
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    setDisplayName(me.user.displayName);
    setAvatarUrl(me.user.avatarUrl ?? '');
  }, [me]);

  const dirty = !!me && (displayName !== me.user.displayName || avatarUrl !== (me.user.avatarUrl ?? ''));

  return (
    <div data-testid="settings-account">
      <SettingsPageHeader title="My account" description="Your profile, visible to everyone in shared workspaces." />

      <SettingsGroup title="Profile">
        <SettingsRow title="Avatar" description="Paste an image URL; uploads land in a later wave.">
          <Avatar name={displayName || 'User'} src={avatarUrl || null} size="lg" />
        </SettingsRow>
        <SettingsForm>
          <Field
            label="Preferred name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            data-testid="account-display-name"
          />
          <Field label="Avatar URL" value={avatarUrl} placeholder="https://…" onChange={(e) => setAvatarUrl(e.target.value)} />
          <div>
            <Button
              size="sm"
              disabled={!dirty || update.isPending || !displayName.trim()}
              data-testid="account-save"
              onClick={() =>
                update.mutate(
                  { displayName: displayName.trim(), avatarUrl: avatarUrl.trim() || null },
                  { onSuccess: () => toast('Profile updated') },
                )
              }
            >
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </SettingsForm>
      </SettingsGroup>

      <SettingsGroup title="Password">
        <SettingsForm>
          <Field
            label="Current password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
          <Field
            label="New password"
            type="password"
            value={next}
            error={error}
            hint="At least 8 characters."
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
          <div>
            <Button
              size="sm"
              variant="secondary"
              disabled={!current || next.length < 8 || changePassword.isPending}
              onClick={() => {
                setError(null);
                changePassword.mutate(
                  { currentPassword: current, newPassword: next },
                  {
                    onSuccess: () => {
                      setCurrent('');
                      setNext('');
                      toast('Password changed');
                    },
                    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not change the password'),
                  },
                );
              }}
            >
              Change password
            </Button>
          </div>
        </SettingsForm>
      </SettingsGroup>
    </div>
  );
}
