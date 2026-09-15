import type { ObsidianImportResult, ObsidianImportUnavailable, ObsidianPreview } from './types';

export type VaultFile = File & { webkitRelativePath?: string };

export class ObsidianImportError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(readMessage(body) ?? `Obsidian import request failed (${status})`);
    this.name = 'ObsidianImportError';
    this.status = status;
    this.body = body;
  }
}

export async function previewVault(workspaceId: string, files: readonly VaultFile[], signal?: AbortSignal): Promise<ObsidianPreview> {
  return request<ObsidianPreview>('/preview', workspaceId, files, signal);
}

export async function importVault(
  workspaceId: string,
  files: readonly VaultFile[],
  signal?: AbortSignal,
): Promise<ObsidianImportResult | ObsidianImportUnavailable> {
  return request<ObsidianImportResult | ObsidianImportUnavailable>('/import', workspaceId, files, signal);
}

async function request<T>(path: string, workspaceId: string, files: readonly VaultFile[], signal?: AbortSignal): Promise<T> {
  const form = new FormData();
  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    form.append('files', file, relativePath);
  }

  const response = await fetch(`/api/plugins/obsidian-import${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Workspace-Id': workspaceId, Accept: 'application/json' },
    body: form,
    signal,
  });
  const body = await readBody(response);
  if (!response.ok) throw new ObsidianImportError(response.status, body);
  return body as T;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readMessage(body: unknown): string | null {
  if (typeof body === 'string' && body.length > 0) return body;
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  for (const key of ['message', 'title', 'detail', 'error']) {
    if (typeof record[key] === 'string' && record[key]) return record[key];
  }
  return null;
}
