import { useState } from 'react';
import { CopyIcon, TrashIcon } from 'lucide-react';
import type { ApiToken, ApiTokenScope } from '@nook/api-client';
import { Button, Checkbox, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, Field, Input, Skeleton } from '@nook/ui';
import { useApiTokens, useCreateApiToken, useDeleteApiToken } from '../../lib/queries';
import { copyText, formatDate } from '../../lib/utils';
import { toast } from '../../stores/toast';
import { SettingsActionRow, SettingsGroup, SettingsList, SettingsListItem, SettingsPageHeader } from './SettingsSection';

const SCOPES: ApiTokenScope[] = ['read', 'write', 'admin'];

export function TokensSettings() {
  const { data: tokens, isPending } = useApiTokens();
  const create = useCreateApiToken();
  const remove = useDeleteApiToken();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiTokenScope[]>(['read']);
  const [revealed, setRevealed] = useState<ApiToken | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiToken | null>(null);

  return (
    <div data-testid="settings-tokens">
      <SettingsPageHeader
        title="API tokens"
        description="Tokens authenticate scripts and integrations with `Authorization: Bearer …`. The value is shown once."
      />

      <SettingsGroup title="Create a token">
        <SettingsActionRow>
          <Field
            label="Name"
            id="token-name"
            className="min-w-0 flex-1"
            value={name}
            placeholder="Obsidian sync"
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex items-center gap-2 pb-1.5">
            {SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-1 text-xs text-fg-secondary">
                <Checkbox
                  checked={scopes.includes(s)}
                  onChange={(e) => setScopes((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))}
                />
                {s}
              </label>
            ))}
          </div>
          <Button
            size="sm"
            disabled={!name.trim() || !scopes.length || create.isPending}
            data-testid="create-token"
            onClick={() =>
              create.mutate(
                { name: name.trim(), scopes },
                {
                  onSuccess: (tok) => {
                    setName('');
                    setRevealed(tok);
                  },
                },
              )
            }
          >
            Create token
          </Button>
        </SettingsActionRow>
      </SettingsGroup>

      <SettingsGroup title="Tokens">
        {isPending ? (
          <Skeleton className="h-10" />
        ) : tokens?.length ? (
          <SettingsList>
            {tokens.map((t) => (
              <SettingsListItem key={t.id} data-testid="token-row">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  <span className="text-xs text-fg-muted">
                    {t.scopes.join(', ')} · created {formatDate(t.createdAt)}
                  </span>
                </span>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.name}`} onClick={() => setConfirmDelete(t)}>
                  <TrashIcon className="size-4" />
                </Button>
              </SettingsListItem>
            ))}
          </SettingsList>
        ) : (
          <SettingsList>
            <SettingsListItem className="py-3 text-sm text-fg-muted">No tokens yet.</SettingsListItem>
          </SettingsList>
        )}
      </SettingsGroup>

      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent>
          <DialogTitle>Copy your token now</DialogTitle>
          <DialogDescription>This is the only time the value is shown. Store it somewhere safe.</DialogDescription>
          <Input readOnly value={revealed?.token ?? ''} className="font-mono text-xs" aria-label="API token" data-testid="token-reveal" />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => void copyText(revealed?.token ?? '', 'Token copied')}>
              <CopyIcon /> Copy
            </Button>
            <Button size="sm" onClick={() => setRevealed(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        variant="destructive"
        title={`Delete “${confirmDelete?.name ?? 'token'}”?`}
        description="Anything using this token stops working immediately."
        confirmLabel="Delete token"
        onConfirm={async () => {
          if (!confirmDelete) return;
          await remove.mutateAsync(confirmDelete.id);
          toast('Token deleted');
        }}
      />
    </div>
  );
}
