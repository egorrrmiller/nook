import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core';
import { getDefaultReactSlashMenuItems, type DefaultReactSuggestionItem } from '@blocknote/react';
import { getMultiColumnSlashMenuItems } from '@blocknote/xl-multi-column';
import {
  AtSignIcon,
  BookmarkIcon,
  BracesIcon,
  CalendarIcon,
  ColumnsIcon,
  CopyIcon,
  CornerUpRightIcon,
  FileTextIcon,
  FileInputIcon,
  FrameIcon,
  LinkIcon,
  ListTreeIcon,
  MapIcon,
  MessageSquareQuoteIcon,
  PaletteIcon,
  RepeatIcon,
  SigmaIcon,
  Trash2Icon,
  WorkflowIcon,
} from 'lucide-react';
import type { AnyEditor } from '../types';
import { GROUPS, groupForDefaultItem, sortByGroup } from './groups';

export interface SlashActions {
  openTurnInto: () => void;
  openColor: () => void;
  openMoveTo: () => void;
  duplicateBlock: () => void;
  deleteBlock: () => void;
  copyLinkToBlock: () => void;
  insertMention: () => void;
  insertDate: () => void;
  insertInlineEquation: () => void;
  insertEmoji: () => void;
}

type Item = DefaultReactSuggestionItem;

function insert(editor: AnyEditor, block: Record<string, unknown>) {
  insertOrUpdateBlockForSlashMenu(editor, block as never);
}

/** Nook's own blocks + the editor actions (`/turn`, `/color`, `/delete`, `/duplicate`, `/moveto`). */
export function nookSlashItems(editor: AnyEditor, actions: SlashActions): Item[] {
  const items: Item[] = [
    {
      title: 'Callout',
      subtext: 'Make writing stand out',
      aliases: ['callout', 'note', 'info', 'warning', 'tip'],
      group: GROUPS.basic,
      icon: <MessageSquareQuoteIcon size={18} />,
      onItemClick: () => insert(editor, { type: 'callout', props: { icon: '💡' } }),
    },
    {
      title: 'Table of contents',
      subtext: 'Links to the headings on this page',
      aliases: ['toc', 'contents', 'outline'],
      group: GROUPS.advanced,
      icon: <ListTreeIcon size={18} />,
      onItemClick: () => insert(editor, { type: 'tableOfContents' }),
    },
    {
      title: 'Web bookmark',
      subtext: 'Save a link as a visual card',
      aliases: ['bookmark', 'link', 'url', 'web'],
      group: GROUPS.embeds,
      icon: <BookmarkIcon size={18} />,
      onItemClick: () => insert(editor, { type: 'bookmark' }),
    },
    {
      title: 'Embed',
      subtext: 'YouTube, Figma, Maps, Loom, Gist…',
      aliases: ['embed', 'iframe', 'youtube', 'figma', 'maps', 'loom'],
      group: GROUPS.embeds,
      icon: <FrameIcon size={18} />,
      onItemClick: () => insert(editor, { type: 'embed' }),
    },
    {
      title: 'Link to page',
      subtext: 'Link to an existing page',
      aliases: ['link to page', 'pagelink', 'page'],
      group: GROUPS.embeds,
      icon: <LinkIcon size={18} />,
      onItemClick: () => insert(editor, { type: 'pageLink' }),
    },
    {
      title: 'Page embed',
      subtext: 'Render another page inline',
      aliases: ['page embed', 'embed page', 'transclude'],
      group: GROUPS.embeds,
      icon: <FileTextIcon size={18} />,
      onItemClick: () => insert(editor, { type: 'pageEmbed' }),
    },
    {
      title: 'Breadcrumb',
      subtext: 'Path to this page',
      aliases: ['breadcrumb', 'path', 'trail'],
      group: GROUPS.embeds,
      icon: <MapIcon size={18} />,
      onItemClick: () => insert(editor, { type: 'breadcrumb' }),
    },
    {
      title: 'PDF',
      subtext: 'Upload or embed a PDF',
      aliases: ['pdf', 'document', 'viewer'],
      group: GROUPS.media,
      icon: <FileInputIcon size={18} />,
      onItemClick: () => insert(editor, { type: 'pdf' }),
    },
    {
      title: 'Block equation',
      subtext: 'LaTeX rendered with KaTeX',
      aliases: ['equation', 'math', 'latex', 'katex', 'formula'],
      group: GROUPS.advanced,
      icon: <SigmaIcon size={18} />,
      onItemClick: () => insert(editor, { type: 'equation' }),
    },
    {
      title: 'Mermaid diagram',
      subtext: 'Flowcharts, sequence and gantt diagrams',
      aliases: ['mermaid', 'diagram', 'flowchart', 'graph'],
      group: GROUPS.advanced,
      icon: <WorkflowIcon size={18} />,
      onItemClick: () => insert(editor, { type: 'mermaid' }),
    },
    {
      title: 'HTML',
      subtext: 'Sandboxed HTML in an iframe',
      aliases: ['html', 'iframe', 'embed html', 'widget'],
      group: GROUPS.advanced,
      icon: <BracesIcon size={18} />,
      onItemClick: () => insert(editor, { type: 'htmlBlock' }),
    },
    // --- inline
    {
      title: 'Mention a page',
      subtext: 'Insert a link to a page (@ or [[)',
      aliases: ['mention', 'page mention', '@'],
      group: GROUPS.inline,
      icon: <AtSignIcon size={18} />,
      onItemClick: actions.insertMention,
    },
    {
      title: 'Date',
      subtext: 'Insert a date (@today)',
      aliases: ['date', 'today', 'tomorrow', 'reminder'],
      group: GROUPS.inline,
      icon: <CalendarIcon size={18} />,
      onItemClick: actions.insertDate,
    },
    {
      title: 'Inline equation',
      subtext: 'LaTeX inside a sentence',
      aliases: ['inline equation', 'inline math', 'latex'],
      group: GROUPS.inline,
      icon: <SigmaIcon size={18} />,
      onItemClick: actions.insertInlineEquation,
    },
    // --- actions
    {
      title: 'Turn into',
      subtext: 'Change this block into another type',
      aliases: ['turn', 'turn into', 'convert', 'change'],
      group: GROUPS.actions,
      icon: <RepeatIcon size={18} />,
      onItemClick: actions.openTurnInto,
    },
    {
      title: 'Color',
      subtext: 'Text and background colour',
      aliases: ['color', 'colour', 'highlight', 'background'],
      group: GROUPS.actions,
      icon: <PaletteIcon size={18} />,
      onItemClick: actions.openColor,
    },
    {
      title: 'Duplicate',
      subtext: 'Copy this block below (⌘D)',
      aliases: ['duplicate', 'copy block'],
      group: GROUPS.actions,
      icon: <CopyIcon size={18} />,
      onItemClick: actions.duplicateBlock,
    },
    {
      title: 'Delete',
      subtext: 'Remove this block',
      aliases: ['delete', 'remove', 'trash'],
      group: GROUPS.actions,
      icon: <Trash2Icon size={18} />,
      onItemClick: actions.deleteBlock,
    },
    {
      title: 'Move to',
      subtext: 'Move this page under another page',
      aliases: ['moveto', 'move to', 'move page'],
      group: GROUPS.actions,
      icon: <CornerUpRightIcon size={18} />,
      onItemClick: actions.openMoveTo,
    },
    {
      title: 'Copy link to block',
      subtext: 'Anchor link to this block',
      aliases: ['copy link', 'anchor', 'permalink'],
      group: GROUPS.actions,
      icon: <LinkIcon size={18} />,
      onItemClick: actions.copyLinkToBlock,
    },
  ];
  return items;
}

/** Everything the slash menu shows: BlockNote defaults (regrouped) + columns + Nook items + plugins. */
export function buildSlashItems(editor: AnyEditor, actions: SlashActions, pluginItems: Item[]): Item[] {
  const defaults = getDefaultReactSlashMenuItems(editor).map((item) => {
    const key = (item as Item & { key?: string }).key;
    return { ...item, group: groupForDefaultItem(key, item.group) };
  });
  const columns = getMultiColumnSlashMenuItems(editor).map((item) => ({
    ...(item as Item),
    group: GROUPS.basic,
    icon: <ColumnsIcon size={18} />,
  }));
  return sortByGroup([...defaults, ...columns, ...nookSlashItems(editor, actions), ...pluginItems]);
}
