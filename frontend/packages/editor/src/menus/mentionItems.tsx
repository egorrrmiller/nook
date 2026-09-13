import type { DefaultReactSuggestionItem } from '@blocknote/react';
import { CalendarIcon, FilePlusIcon } from 'lucide-react';
import type { ApiClient, Node } from '@nook/api-client';
import { NodeIcon } from '../components/NodeIcon';
import { primeNodeInfo } from '../util/nodeCache';
import { parseDateQuery, formatDate, todayIso } from '../schema/inline/dateMention';
import type { AnyEditor } from '../types';
import { GROUPS } from './groups';

export interface MentionMenuDeps {
  api: ApiClient;
  /** Current page — new `[[Title]]` pages are created under it. */
  nodeId: string;
  toast: (m: string) => void;
  createPage: (title: string) => Promise<Node>;
}

const DATE_WORDS = ['today', 'tomorrow', 'yesterday', 'next week', 'last week'];

/**
 * Items for the `@` and `[[` menus: quick-find pages (§7.4), date mentions and — for `[[` —
 * "Create page", which creates the page under the current one and inserts the mention.
 */
export async function mentionMenuItems(
  editor: AnyEditor,
  query: string,
  deps: MentionMenuDeps,
  options: { allowCreate: boolean; allowDates: boolean },
): Promise<DefaultReactSuggestionItem[]> {
  const items: DefaultReactSuggestionItem[] = [];
  const insertMention = (nodeId: string, title: string) => {
    editor.insertInlineContent([{ type: 'mention', props: { nodeId, title } }, ' ']);
  };

  if (options.allowDates) {
    const iso = parseDateQuery(query);
    if (iso || (!query && options.allowDates)) {
      const date = iso ?? todayIso();
      items.push({
        title: formatDate(date),
        subtext: 'Insert date',
        group: GROUPS.inline,
        icon: <CalendarIcon size={18} />,
        onItemClick: () => editor.insertInlineContent([{ type: 'dateMention', props: { date, end: '' } }, ' ']),
      });
    } else if (query && DATE_WORDS.some((w) => w.startsWith(query.toLowerCase()))) {
      const word = DATE_WORDS.find((w) => w.startsWith(query.toLowerCase()))!;
      const date = parseDateQuery(word)!;
      items.push({
        title: formatDate(date),
        subtext: word,
        group: GROUPS.inline,
        icon: <CalendarIcon size={18} />,
        onItemClick: () => editor.insertInlineContent([{ type: 'dateMention', props: { date, end: '' } }, ' ']),
      });
    }
  }

  let hits: Awaited<ReturnType<ApiClient['search']['quick']>> = [];
  try {
    hits = await deps.api.search.quick({ q: query, limit: 12 });
  } catch {
    hits = [];
  }
  for (const hit of hits) {
    items.push({
      title: hit.node.title?.trim() || 'Untitled',
      subtext: hit.breadcrumb.map((b) => b.title?.trim() || 'Untitled').join(' / ') || undefined,
      group: 'Pages',
      icon: <NodeIcon icon={hit.node.icon} kind={hit.node.kind} size={18} />,
      onItemClick: () => {
        primeNodeInfo(hit.node);
        insertMention(hit.node.id, hit.node.title);
      },
    });
  }

  const trimmed = query.trim();
  const exact = hits.some((h) => (h.node.title ?? '').toLowerCase() === trimmed.toLowerCase());
  if (options.allowCreate && trimmed && !exact) {
    items.push({
      title: `Create page "${trimmed}"`,
      subtext: 'New sub-page of this page',
      group: 'New',
      icon: <FilePlusIcon size={18} />,
      onItemClick: () => {
        void deps
          .createPage(trimmed)
          .then((node) => {
            primeNodeInfo(node);
            insertMention(node.id, node.title);
          })
          .catch(() => deps.toast('Could not create the page'));
      },
    });
  }
  return items;
}
