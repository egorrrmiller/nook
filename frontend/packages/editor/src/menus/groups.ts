/** Notion-style slash-menu groups (PLAN §1.2). */
export const GROUPS = {
  basic: 'Basic blocks',
  media: 'Media',
  embeds: 'Embeds',
  advanced: 'Advanced',
  inline: 'Inline',
  actions: 'Actions',
  plugins: 'Plugins',
} as const;

export const GROUP_ORDER: string[] = [GROUPS.basic, GROUPS.media, GROUPS.embeds, GROUPS.advanced, GROUPS.inline, GROUPS.actions, GROUPS.plugins];

/** BlockNote's default slash-item keys → our group names. */
const KEY_GROUP: Record<string, string> = {
  paragraph: GROUPS.basic,
  heading: GROUPS.basic,
  heading_2: GROUPS.basic,
  heading_3: GROUPS.basic,
  heading_4: GROUPS.basic,
  heading_5: GROUPS.basic,
  heading_6: GROUPS.basic,
  toggle_heading: GROUPS.basic,
  toggle_heading_2: GROUPS.basic,
  toggle_heading_3: GROUPS.basic,
  quote: GROUPS.basic,
  toggle_list: GROUPS.basic,
  numbered_list: GROUPS.basic,
  bullet_list: GROUPS.basic,
  check_list: GROUPS.basic,
  divider: GROUPS.basic,
  code_block: GROUPS.basic,
  table: GROUPS.advanced,
  image: GROUPS.media,
  video: GROUPS.media,
  audio: GROUPS.media,
  file: GROUPS.media,
  emoji: GROUPS.inline,
  page_break: GROUPS.advanced,
};

export function groupForDefaultItem(key: string | undefined, fallback: string | undefined): string {
  return (key && KEY_GROUP[key]) || fallback || GROUPS.advanced;
}

/** Sorts items by our group order, keeping the order inside each group. */
export function sortByGroup<T extends { group?: string }>(items: T[]): T[] {
  const index = (g?: string) => {
    const i = GROUP_ORDER.indexOf(g ?? '');
    return i === -1 ? GROUP_ORDER.length : i;
  };
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => index(a.item.group) - index(b.item.group) || a.i - b.i)
    .map(({ item }) => item);
}
