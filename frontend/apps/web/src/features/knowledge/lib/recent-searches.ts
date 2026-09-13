import { readJson, writeJson } from './storage';

const MAX = 8;
const key = (workspaceId: string) => `nook.search.recent:${workspaceId}`;

export function getRecentSearches(workspaceId: string): string[] {
  const list = readJson<unknown>(key(workspaceId), []);
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
}

export function pushRecentSearch(workspaceId: string, query: string): string[] {
  const q = query.trim();
  if (!q) return getRecentSearches(workspaceId);
  const next = [q, ...getRecentSearches(workspaceId).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
  writeJson(key(workspaceId), next);
  return next;
}

export function clearRecentSearches(workspaceId: string): void {
  writeJson(key(workspaceId), []);
}
