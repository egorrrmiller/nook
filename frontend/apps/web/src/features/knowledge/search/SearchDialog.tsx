import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowDownUpIcon, ChevronRightIcon, ClockIcon, FileSearchIcon, Loader2Icon, SearchIcon, SearchXIcon, XIcon } from 'lucide-react';
import type { SearchHit, SearchSort } from '@nook/api-client';
import { Button, Dialog, DialogContent, IconButton, Input, Kbd, Menu, MenuContent, MenuItem, MenuTrigger, Skeleton, Toolbar, cn } from '@nook/ui';
import { nodeTitle } from '../../../lib/utils';
import { useSearch, useTags } from '../api/queries';
import { clearRecentSearches, getRecentSearches, pushRecentSearch } from '../lib/recent-searches';
import { highlightTerms, parseSnippet } from '../lib/snippet';
import { EmptyState } from '../ui/EmptyState';
import { Marked } from '../ui/Marked';
import { NodeIcon } from '../ui/NodeIcon';
import { EMPTY_FILTERS, activeFilterCount, buildSearchRequest, type SearchFilterState } from './build-request';
import { DateFilter, KindsFilter, TagsFilter, ToggleChip, chipClass } from './filters';

const SORTS: { value: SearchSort; label: string }[] = [
  { value: 'relevance', label: 'Best match' },
  { value: 'updated', label: 'Last edited' },
  { value: 'created', label: 'Created' },
];

const MATCHED_LABEL: Record<SearchHit['matchedIn'], string> = { title: 'Title', content: 'Content', file: 'File', alias: 'Alias' };

const relTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function ago(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'just now';
  if (abs < 3600) return relTime.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return relTime.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return relTime.format(Math.round(diff / 86400), 'day');
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Full-text search modal (contracts §9.5, §10). Opened by `useUiStore().searchOpen` in the shell. */
export function SearchDialog({
  workspaceId,
  open,
  onOpenChange,
  initialQuery,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialQuery?: string;
}) {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { nodeId?: string };
  const currentNodeId = params.nodeId ?? null;
  const [query, setQuery] = useState(initialQuery ?? '');
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SearchSort>('relevance');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounced = useDebounced(query, 200);
  const { data: tags } = useTags(workspaceId, open);

  useEffect(() => {
    if (open) {
      setQuery(initialQuery ?? '');
      setRecent(getRecentSearches(workspaceId));
      setActive(0);
    }
  }, [open, initialQuery, workspaceId]);

  const body = useMemo(() => buildSearchRequest(debounced, filters, sort, currentNodeId), [debounced, filters, sort, currentNodeId]);
  const enabled = open && body.query.length > 0;
  const search = useSearch(workspaceId, body, enabled);
  const hits = useMemo(() => search.data?.pages.flatMap((p) => p.hits) ?? [], [search.data]);
  const total = search.data?.pages[0]?.total ?? 0;
  const terms = useMemo(() => debounced.trim().split(/\s+/).filter(Boolean), [debounced]);
  const groups = useMemo(() => {
    const pages = hits.filter((hit) => !hit.attachment && hit.matchedIn !== 'file');
    const files = hits.filter((hit) => hit.attachment || hit.matchedIn === 'file');
    return [
      ...(pages.length ? [{ label: 'Pages', hits: pages }] : []),
      ...(files.length ? [{ label: 'Attachments', hits: files }] : []),
    ];
  }, [hits]);

  useEffect(() => setActive(0), [body]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const openHit = useCallback(
    (hit: SearchHit) => {
      setRecent(pushRecentSearch(workspaceId, query));
      onOpenChange(false);
      void navigate({
        to: '/w/$workspaceId/p/$nodeId',
        params: { workspaceId, nodeId: hit.node.id },
        hash: hit.blockId ? `b-${hit.blockId}` : undefined,
      });
    },
    [navigate, onOpenChange, query, workspaceId],
  );

  // Infinite scroll sentinel (IntersectionObserver is missing in jsdom → "Load more" button fallback).
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined' || !search.hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !search.isFetchingNextPage) void search.fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [search, search.hasNextPage, search.isFetchingNextPage, hits.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hits.length) setActive((a) => Math.min(hits.length - 1, Math.max(0, a + 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (hits.length) setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Home' && hits.length) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End' && hits.length) {
      e.preventDefault();
      setActive(hits.length - 1);
    } else if (e.key === 'Enter') {
      const hit = hits[active];
      if (hit) {
        e.preventDefault();
        openHit(hit);
      }
    } else if (e.key === 'Escape') {
      onOpenChange(false);
    }
  };

  const nFilters = activeFilterCount(filters);
  const showRecent = query.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        aria-label="Search"
        data-testid="search-dialog"
        initialFocus={inputRef}
        className="nook-search-dialog top-[10%] flex max-h-[80vh] w-[min(720px,calc(100vw-32px))] max-w-none -translate-y-0 flex-col gap-0 overflow-hidden p-0"
      >
        <div className="nook-search__header flex items-center gap-2 border-b border-border px-3">
          {search.isFetching && enabled ? <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" /> : <SearchIcon className="size-4 shrink-0 text-muted-foreground" />}
          <Input
            ref={inputRef}
            data-testid="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-activedescendant={hits[active] ? `search-result-${active}` : undefined}
            placeholder={`Search ${filters.inCurrentTree && currentNodeId ? 'in this page tree' : 'everything'}…`}
            aria-label="Search query"
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full rounded-none border-0 bg-transparent px-0 text-base shadow-none focus-visible:border-0 focus-visible:ring-0"
          />
          {query ? (
            <IconButton label="Clear query" size="icon-sm" tooltip={false} onClick={() => setQuery('')} className="text-muted-foreground hover:bg-accent hover:text-foreground">
              <XIcon className="size-4" />
            </IconButton>
          ) : null}
          <Kbd className="hidden sm:inline-flex">esc</Kbd>
        </div>

        <Toolbar aria-label="Search filters" className="nook-search__filters flex-wrap gap-1.5 border-b border-border px-3 py-2" data-testid="search-filters">
          <ToggleChip testId="search-filter-title-only" active={filters.titleOnly} onClick={() => setFilters((f) => ({ ...f, titleOnly: !f.titleOnly }))}>
            Title only
          </ToggleChip>
          {currentNodeId ? (
            <ToggleChip testId="search-filter-in-tree" active={filters.inCurrentTree} onClick={() => setFilters((f) => ({ ...f, inCurrentTree: !f.inCurrentTree }))}>
              In current page
            </ToggleChip>
          ) : null}
          <KindsFilter value={filters.kinds} onChange={(kinds) => setFilters((f) => ({ ...f, kinds }))} />
          <TagsFilter tags={tags ?? []} value={filters.tagIds} onChange={(tagIds) => setFilters((f) => ({ ...f, tagIds }))} />
          <DateFilter testId="search-filter-created" label="Created" value={filters.created} onChange={(created) => setFilters((f) => ({ ...f, created }))} />
          <DateFilter testId="search-filter-updated" label="Updated" value={filters.updated} onChange={(updated) => setFilters((f) => ({ ...f, updated }))} />
          <ToggleChip testId="search-filter-archived" active={filters.includeArchived} onClick={() => setFilters((f) => ({ ...f, includeArchived: !f.includeArchived }))}>
            Archived
          </ToggleChip>
          <ToggleChip testId="search-filter-files" active={filters.includeFiles} onClick={() => setFilters((f) => ({ ...f, includeFiles: !f.includeFiles }))} title="Search inside attachments">
            Files
          </ToggleChip>
          {nFilters ? (
            <Button type="button" variant="link" size="xs" onClick={() => setFilters(EMPTY_FILTERS)} className="h-auto px-1 text-xs font-normal text-muted-foreground">
              Clear {nFilters}
            </Button>
          ) : null}
          <span className="ml-auto" />
          <Menu>
            <MenuTrigger data-testid="search-sort" className={chipClass}>
              <ArrowDownUpIcon /> {SORTS.find((s) => s.value === sort)?.label}
            </MenuTrigger>
            <MenuContent align="end">
              {SORTS.map((s) => (
                <MenuItem key={s.value} onClick={() => setSort(s.value)} className={cn(sort === s.value && 'font-medium')}>
                  {s.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        </Toolbar>

        <div className="nook-search__results min-h-0 flex-1 overflow-y-auto" data-testid="search-results">
          {showRecent ? (
            <div className="p-2">
              {recent.length ? (
                <>
                  <div className="flex items-center px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Recent searches
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      onClick={() => {
                        clearRecentSearches(workspaceId);
                        setRecent([]);
                      }}
                      className="ml-auto h-auto px-1 font-normal normal-case text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </Button>
                  </div>
                  <ul>
                    {recent.map((r) => (
                      <li key={r}>
                        <Button
                          type="button"
                          variant="subtle"
                          size="sm"
                          data-testid="recent-search"
                          onClick={() => setQuery(r)}
                          className="h-auto w-full justify-start rounded-md px-2 py-1.5 text-left font-normal"
                        >
                          <ClockIcon className="size-4 text-muted-foreground" />
                          <span className="truncate">{r}</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <EmptyState icon={<FileSearchIcon />} title="Search your workspace" hint="Titles, aliases, page content and attachments." />
              )}
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-2 pt-2 text-[11px] text-muted-foreground">
                <span>
                  <code className="rounded-sm bg-muted px-1">"exact phrase"</code>
                </span>
                <span>
                  <code className="rounded-sm bg-muted px-1">-exclude</code>
                </span>
                <span>
                  <code className="rounded-sm bg-muted px-1">title:word</code>
                </span>
                <span>Terms match by prefix and are combined with AND.</span>
              </div>
            </div>
          ) : search.isPending && enabled ? (
            <div className="flex flex-col gap-2 p-3" aria-busy>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex gap-2">
                  <Skeleton className="size-5" />
                  <div className="flex flex-1 flex-col gap-1">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : search.isError ? (
            <EmptyState icon={<SearchXIcon />} title="Search failed" hint={search.error.message} />
          ) : hits.length === 0 ? (
            <EmptyState
              icon={<SearchXIcon />}
              title={`No results for “${debounced.trim()}”`}
              hint={nFilters ? 'Try removing some filters.' : 'Check the spelling or try fewer words.'}
            />
          ) : (
            <>
              <ul ref={listRef} role="listbox" aria-label="Search results" className="p-1">
                {groups.map((group) => (
                  <li key={group.label} role="presentation">
                    <div className="nook-search__group-label">
                      <span>{group.label}</span>
                      <span>{group.hits.length}</span>
                    </div>
                    <ul>
                      {group.hits.map((hit) => {
                        const i = hits.indexOf(hit);
                        return (
                          <li
                            key={`${hit.node.id}:${hit.blockId ?? ''}:${hit.attachment?.id ?? ''}`}
                            id={`search-result-${i}`}
                            role="option"
                            aria-selected={i === active}
                            data-index={i}
                            data-testid="search-result"
                            onMouseEnter={() => setActive(i)}
                            onClick={() => openHit(hit)}
                            className={cn('nook-search__result', i === active && 'nook-search__result--active')}
                          >
                            <NodeIcon icon={hit.node.icon} kind={hit.node.kind} className="mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <Marked
                                  parts={highlightTerms(nodeTitle(hit.node.title), terms)}
                                  className="min-w-0 flex-1 truncate text-sm font-medium"
                                />
                                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{MATCHED_LABEL[hit.matchedIn]}</span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">{ago(hit.node.updatedAt)}</span>
                              </div>
                              {hit.breadcrumb.length ? (
                                <div className="nook-search__breadcrumb">
                                  {hit.breadcrumb.map((b, breadcrumbIndex) => (
                                    <span key={b.id} className="inline-flex min-w-0 items-center">
                                      {breadcrumbIndex ? <ChevronRightIcon className="size-3 shrink-0" /> : null}
                                      <span className="truncate">{nodeTitle(b.title)}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              {hit.snippet ? (
                                <Marked parts={parseSnippet(hit.snippet)} className="mt-1 line-clamp-2 block text-[13px] leading-snug text-foreground/80" />
                              ) : null}
                              {hit.attachment ? <div className="nook-search__attachment">{hit.attachment.filename}</div> : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
              <div ref={sentinel} className="h-px" />
              {search.hasNextPage ? (
                <div className="flex justify-center p-2">
                  <Button
                    type="button"
                    variant="subtle"
                    size="sm"
                    data-testid="search-load-more"
                    disabled={search.isFetchingNextPage}
                    onClick={() => void search.fetchNextPage()}
                    className="text-xs text-muted-foreground"
                  >
                    {search.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="nook-search__footer flex items-center gap-3 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="ml-auto" data-testid="search-total">
            {enabled && search.data ? `${total} result${total === 1 ? '' : 's'}` : ''}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
