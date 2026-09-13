import { useState } from 'react';
import { DownloadIcon, UploadIcon } from 'lucide-react';
import { Button } from '@nook/ui';
import { usePluginSettingsPages } from '@nook/plugin-sdk';
import { ExportDialog, ImportDialog } from '../../features/knowledge';
import { useNodes } from '../../lib/queries';
import { SettingsGroup, SettingsPageHeader, SettingsRow } from './SettingsSection';

/** Hosts the knowledge agent's import/export dialogs plus plugin settings pages (§9.8, plugin SDK). */
export function ImportExportSettings({ workspaceId }: { workspaceId: string }) {
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const { data: roots } = useNodes(workspaceId, null);
  const pluginPages = usePluginSettingsPages();

  return (
    <div data-testid="settings-import-export">
      <SettingsPageHeader title="Import / export" description="Move content in and out of this workspace." />

      <SettingsGroup title="Content">
        <SettingsRow title="Import" description="Markdown, HTML, CSV, plain text or a .zip archive.">
          <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)} data-testid="open-import">
            <UploadIcon /> Import
          </Button>
        </SettingsRow>
        <SettingsRow title="Export workspace" description="Every top-level page and its children as Markdown or HTML.">
          <Button size="sm" variant="secondary" onClick={() => setExportOpen(true)} data-testid="open-export">
            <DownloadIcon /> Export all
          </Button>
        </SettingsRow>
      </SettingsGroup>

      {pluginPages.length ? (
        <SettingsGroup title="Plugins">
          {pluginPages.map((page) => {
            const Page = page.component;
            return (
              <section key={`${page.pluginId}:${page.id}`} className="border-b border-border py-3 last:border-0">
                <h3 className="mb-2 text-sm font-medium">{page.title}</h3>
                <Page />
              </section>
            );
          })}
        </SettingsGroup>
      ) : null}

      <ImportDialog workspaceId={workspaceId} parentId={null} open={importOpen} onOpenChange={setImportOpen} />
      <ExportDialog
        workspaceId={workspaceId}
        nodeIds={(roots ?? []).map((n) => n.id)}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </div>
  );
}
