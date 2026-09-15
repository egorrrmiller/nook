import { definePlugin } from '@nook/plugin-sdk';
import { AiSettingsPage } from './AiSettingsPage';

export { applyAiPreview } from './apply';
export type { AiApplyAdapter, AiApplyResult } from './apply';
export { createAiApiClient } from './api';
export type { AiApiClient } from './api';
export { AiPluginProvider, useAiApi } from './AiPluginProvider';
export { AiSettingsPage } from './AiSettingsPage';
export { AiWritingPanel } from './AiWritingPanel';
export { blockText, cloneBlock, flattenBlocks, selectBlocks } from './selection';
export type * from './types';

/** Static frontend package definition. The host decides whether/when to include it in its registry. */
export const aiPlugin = definePlugin({
  id: 'ai',
  name: 'AI writing',
  version: '0.1.0',
  settingsPages: [{ id: 'settings', title: 'AI writing', component: AiSettingsPage }],
});
