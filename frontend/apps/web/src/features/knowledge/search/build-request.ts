import type { NodeKind, SearchRequest, SearchSort } from '@nook/api-client';

export interface DateRangeFilter {
  from?: string;
  to?: string;
}

export interface SearchFilterState {
  titleOnly: boolean;
  /** Restrict to the subtree of the current page (`scope.ancestorId`). */
  inCurrentTree: boolean;
  kinds: NodeKind[];
  tagIds: string[];
  created: DateRangeFilter;
  updated: DateRangeFilter;
  includeArchived: boolean;
  includeFiles: boolean;
}

export const EMPTY_FILTERS: SearchFilterState = {
  titleOnly: false,
  inCurrentTree: false,
  kinds: [],
  tagIds: [],
  created: {},
  updated: {},
  includeArchived: false,
  includeFiles: false,
};

export function activeFilterCount(f: SearchFilterState): number {
  return (
    Number(f.titleOnly) +
    Number(f.inCurrentTree) +
    Number(f.kinds.length > 0) +
    Number(f.tagIds.length > 0) +
    Number(!!(f.created.from || f.created.to)) +
    Number(!!(f.updated.from || f.updated.to)) +
    Number(f.includeArchived) +
    Number(f.includeFiles)
  );
}

/** Pure mapping UI state → `POST /api/search` body (contracts §9.5); omits empty filters. */
export function buildSearchRequest(
  query: string,
  f: SearchFilterState,
  sort: SearchSort,
  currentNodeId: string | null | undefined,
  limit = 20,
): Omit<SearchRequest, 'cursor'> {
  const filters: NonNullable<SearchRequest['filters']> = {};
  if (f.titleOnly) filters.titleOnly = true;
  if (f.kinds.length) filters.kinds = [...f.kinds];
  if (f.tagIds.length) filters.tagIds = [...f.tagIds];
  if (f.created.from) filters.createdFrom = f.created.from;
  if (f.created.to) filters.createdTo = f.created.to;
  if (f.updated.from) filters.updatedFrom = f.updated.from;
  if (f.updated.to) filters.updatedTo = f.updated.to;
  if (f.includeArchived) filters.includeArchived = true;
  if (f.includeFiles) filters.includeFiles = true;
  const body: Omit<SearchRequest, 'cursor'> = { query: query.trim(), limit };
  if (f.inCurrentTree && currentNodeId) body.scope = { ancestorId: currentNodeId };
  if (Object.keys(filters).length) body.filters = filters;
  if (sort !== 'relevance') body.sort = sort;
  return body;
}

/** Quick date presets for the created/updated filters (local days, ISO `YYYY-MM-DD`). */
export function datePreset(preset: 'today' | 'week' | 'month' | 'year', now = new Date()): DateRangeFilter {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const from = new Date(now);
  if (preset === 'week') from.setDate(from.getDate() - 7);
  else if (preset === 'month') from.setDate(from.getDate() - 30);
  else if (preset === 'year') from.setFullYear(from.getFullYear() - 1);
  return { from: iso(from), to: iso(now) };
}
