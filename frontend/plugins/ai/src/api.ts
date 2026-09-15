import type { Http } from '@nook/api-client';
import type { AiPreview, AiPreviewRequest, AiSettings, AiSettingsUpdate } from './types';

export interface AiApiClient {
  getSettings: (signal?: AbortSignal) => Promise<AiSettings>;
  saveSettings: (request: AiSettingsUpdate) => Promise<AiSettings>;
  preview: (request: AiPreviewRequest, signal?: AbortSignal) => Promise<AiPreview>;
}

/** The plugin receives the host-configured HTTP client; it never knows cookies, tokens, or base URLs. */
export function createAiApiClient(http: Http): AiApiClient {
  return {
    getSettings: (signal) => http<AiSettings>('GET', '/api/plugins/ai/settings', { signal }),
    saveSettings: (request) => http<AiSettings>('PUT', '/api/plugins/ai/settings', { body: request }),
    preview: (request, signal) => http<AiPreview>('POST', '/api/plugins/ai/preview', { body: request, signal }),
  };
}
