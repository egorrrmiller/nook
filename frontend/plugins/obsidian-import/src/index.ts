import { definePlugin } from '@nook/plugin-sdk';
import { VaultImportPanel } from './VaultImportPanel';

/** Self-hosted Obsidian vault picker and dry-run/import workflow. */
export const obsidianImportPlugin = definePlugin({
  id: 'obsidian-import',
  name: 'Obsidian import',
  version: '0.1.0',
  sidebarPanels: [
    {
      id: 'vault-import',
      title: 'Obsidian vault',
      component: VaultImportPanel,
    },
  ],
});

export { VaultImportPanel } from './VaultImportPanel';
export { importVault, ObsidianImportError, previewVault } from './api';
export type { VaultFile } from './api';
export type * from './types';
