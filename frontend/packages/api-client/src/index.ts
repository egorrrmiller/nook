export * from './types';
export { ApiError, buildQuery, createHttp } from './http';
export type { ApiConfig, Http, HttpMethod, Query, RequestOptions } from './http';
export { createApiClient } from './manual';
export type { ApiClient } from './manual';
export { decodeCollabToken, decodeJwtPayload } from './jwt';

import type { ApiConfig } from './http';
import { createApiClient } from './manual';

/**
 * Shared default instance. The app calls `configureApi` once at boot to plug in
 * the active-workspace store; every call then carries `X-Workspace-Id`.
 */
const defaultConfig: ApiConfig = {
  baseUrl: '',
  getWorkspaceId: () => null,
};

export function configureApi(patch: Partial<ApiConfig>): void {
  Object.assign(defaultConfig, patch);
}

export const api = createApiClient(defaultConfig);
